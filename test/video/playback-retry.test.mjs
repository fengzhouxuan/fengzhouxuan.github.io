import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBackendTransport } from '../../source/video/resilience.js';
import { requestEpisode } from '../../source/video/core.js';
import { appHarness } from './fixtures/app-harness.cjs';

const source = await readFile(new URL('../../source/video/app.js', import.meta.url), 'utf8');
const base = 'https://service.example';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function page({ phase = 'ready', direct = false, fetchImpl = async () => Response.json({ status: 'ok', url: 'https://cdn.example/1.mp4' }) } = {}) {
  const transport = createBackendTransport({ base, fetchImpl });
  Object.assign(transport.state, { phase, retryAt: phase === 'ready' ? 0 : Date.now() + 60000 });
  const episode = { name: '第1集', ...(direct ? { url: 'https://cdn.example/1.mp4' } : { ref: '2-1' }) };
  const state = { route: { view: 'watch' }, current: { source: 'pianku', id: '12', lines: [{ episodes: [episode] }] }, line: 0, episode: 0, playbackVersion: 1 };
  const nodes = new Map(); const started = []; const messages = []; let saves = 0;
  const harness = appHarness(source, {
    state, backendTransport: transport, playbackPosition: () => 53, saveProgress: () => { saves++; },
    $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
    screenMessage: message => messages.push(message), prepareVideo() {},
    startEpisode: async (index, position) => {
      state.playbackVersion++;
      const url = episode.ref ? await requestEpisode('pianku', '12', episode.ref, episode.name, { base, fetchImpl: transport.fetch }) : episode.url;
      started.push({ index, position, url });
    },
  });
  const start = source.indexOf('async function retryCurrentPlayback(');
  const end = source.indexOf('\nasync function playbackError(', start);
  assert.ok(start >= 0 && end > start, 'Missing playback retry function boundary');
  harness.run(source.slice(start, end));
  return { state, transport, nodes, started, messages, saves: () => saves, retry: () => harness.run('retryCurrentPlayback()') };
}

test('one explicit playback retry recovers an unavailable service and reissues the same episode at the saved position', async () => {
  const calls = [];
  const view = page({ phase: 'unavailable', fetchImpl: async url => { calls.push(new URL(url).pathname); return Response.json({ status: 'ok', url: 'https://cdn.example/1.mp4' }); } });
  await view.retry();
  assert.deepEqual(calls, ['/healthz', '/api/play']);
  assert.deepEqual(view.started, [{ index: 0, position: 53, url: 'https://cdn.example/1.mp4' }]);
  assert.equal(view.transport.state.phase, 'ready'); assert.equal(view.state.manualRetryBusy, false);
});

test('ready retries and direct media never add health probes, while lazy quota-limited playback remains stopped', async () => {
  for (const phase of ['ready', 'unavailable', 'limited']) {
    const calls = []; const view = page({ phase, direct: true, fetchImpl: async url => { calls.push(url); return Response.json({}); } });
    await view.retry(); assert.equal(view.started.length, 1); assert.equal(calls.length, 0);
  }
  const calls = []; const ready = page({ fetchImpl: async url => { calls.push(new URL(url).pathname); return Response.json({ url: 'https://cdn.example/1.mp4' }); } });
  await ready.retry(); assert.deepEqual(calls, ['/api/play']);
  const limited = page({ phase: 'limited', fetchImpl: async () => { throw new Error('must not fetch'); } });
  await limited.retry(); assert.equal(limited.started.length, 0); assert.match(limited.messages.at(-1), /额度已用完/); assert.equal(limited.transport.state.phase, 'limited');
});

test('duplicate playback retry clicks share one recovery and one resolver request', async () => {
  const health = deferred(); const play = deferred(); const calls = [];
  const view = page({ phase: 'unavailable', fetchImpl: url => { const path = new URL(url).pathname; calls.push(path); return path === '/healthz' ? health.promise : play.promise; } });
  const pending = view.retry(); await view.retry();
  assert.deepEqual(calls, ['/healthz']); assert.equal(view.nodes.get('retry-play').disabled, true);
  health.resolve(Response.json({ status: 'ok' })); await new Promise(resolve => setImmediate(resolve));
  await view.retry(); assert.deepEqual(calls, ['/healthz', '/api/play']);
  play.resolve(Response.json({ url: 'https://cdn.example/1.mp4' })); await pending;
  assert.equal(view.started.length, 1); assert.equal(view.saves(), 1); assert.equal(view.nodes.get('reload-play').disabled, false);
});

test('changing film, line, episode, route or cancelling during recovery never starts stale playback', async () => {
  for (const change of [state => { state.current = { ...state.current }; }, state => { state.line++; }, state => { state.episode++; }, state => { state.route.view = 'library'; }, state => { state.playbackVersion++; }]) {
    const health = deferred(); const calls = [];
    const view = page({ phase: 'unavailable', fetchImpl: url => { calls.push(new URL(url).pathname); return health.promise; } });
    const pending = view.retry(); change(view.state); health.resolve(Response.json({ status: 'ok' })); await pending;
    assert.deepEqual(calls, ['/healthz']); assert.equal(view.started.length, 0); assert.equal(view.state.manualRetryBusy, false);
  }
});

test('failed recovery preserves retry feedback without loops or quota bypass', async () => {
  for (const response of [new Error('private backend detail'), new Response('busy', { status: 503 }), Response.json({ code: 'backend_quota' }, { status: 503 })]) {
    let calls = 0;
    const view = page({ phase: 'unavailable', fetchImpl: async () => { calls++; if (response instanceof Error) throw response; return response.clone(); } });
    await view.retry(); assert.equal(calls, 1); assert.equal(view.started.length, 0); assert.equal(view.nodes.get('playback-feedback').hidden, false);
    assert.match(view.messages.at(-1), /观看位置已保留/); assert.doesNotMatch(view.messages.at(-1), /private/); assert.equal(view.nodes.get('retry-play').disabled, false);
  }
});

test('a quota stop arriving during the health probe is preserved even when the health response succeeds', async () => {
  const health = deferred(); const calls = [];
  const view = page({ phase: 'unavailable', fetchImpl: url => { calls.push(new URL(url).pathname); return health.promise; } });
  const pending = view.retry();
  Object.assign(view.transport.state, { phase: 'limited', retryAt: Date.now() + 60000 });
  health.resolve(Response.json({ status: 'ok' })); await pending;
  assert.deepEqual(calls, ['/healthz']); assert.equal(view.started.length, 0); assert.equal(view.transport.state.phase, 'limited');
  assert.match(view.messages.at(-1), /额度已用完/);
});

test('leaving watch before an unsuccessful probe resolves does not overwrite another page with playback feedback', async () => {
  const health = deferred(); const view = page({ phase: 'unavailable', fetchImpl: () => health.promise });
  const pending = view.retry(); view.state.route.view = 'library';
  health.resolve(new Response('busy', { status: 503 })); await pending;
  assert.equal(view.started.length, 0); assert.equal(view.messages.length, 1); assert.equal(view.nodes.has('playback-feedback'), false);
  await view.retry(); assert.equal(view.saves(), 1);
});
