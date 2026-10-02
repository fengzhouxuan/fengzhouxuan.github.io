import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoQuery } from '../query.js';
import { piankuList, piankuDetail, piankuPlay, aueteList, aueteDetail, auetePlay, zipSearch, zipDetail } from './fixtures/site-pages.js';

const blog = 'https://fengzhouxuan.github.io';
const request = (path, options = {}) => new Request('https://video-api.example' + path, options);

test('portable query handler permits exact configured origins on success, errors and preflight', async () => {
  let calls = 0;
  const query = createVideoQuery({ fetchImpl: async () => { calls++; return new Response('{"list":[]}'); } });
  for (const [path, method, status] of [['/healthz', 'GET', 200], ['/api/vod?source=liangzi&q=test', 'GET', 200], ['/api/vod?source=unknown&q=test', 'GET', 400], ['/worker.js', 'GET', 404], ['/api/vod', 'POST', 405], ['/api/vod', 'OPTIONS', 204]]) {
    const response = await query(request(path, { method, headers: { Origin: blog } }), { allowedOrigins: [blog] });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), blog);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
    assert.equal(response.headers.get('Vary'), 'Origin');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    if (status === 204) assert.equal(await response.text(), '');
  }
  for (const origin of [blog + '.evil.example', 'https://elsewhere.example']) {
    const response = await query(request('/api/vod?source=liangzi&q=test', { headers: { Origin: origin } }), { allowedOrigins: [blog] });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(response.headers.get('Vary'), 'Origin');
  }
  const health = await query(request('/healthz'));
  assert.deepEqual(await health.json(), { service: 'videostation-api', status: 'ok' });
  assert.equal(health.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls, 1);
});

test('query cache expires, stays bounded and never caches upstream failures', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  let calls = 0; let fail = true;
  const query = createVideoQuery({ fetchImpl: async () => {
    calls++;
    return new Response(fail ? 'private upstream error' : '{"list":[]}');
  } });
  const first = request('/api/vod?source=liangzi&q=first');
  const failure = await query(first);
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /private/);
  fail = false;
  assert.equal((await query(first)).status, 200);
  assert.equal((await query(first)).status, 200);
  assert.equal(calls, 2);
  now += 300001;
  assert.equal((await query(first)).status, 200);
  assert.equal(calls, 3);
  for (let index = 0; index < 200; index++) assert.equal((await query(request('/api/vod?source=liangzi&q=' + index))).status, 200);
  assert.equal((await query(first)).status, 200);
  assert.equal(calls, 204);
});

test('upstream deadline returns a readable error with CORS and permits retry', async () => {
  let timedOut = false;
  const query = createVideoQuery({ upstreamTimeout: 5, fetchImpl: async (url, { signal }) => {
    if (timedOut) return new Response('{"list":[]}');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 100);
      signal.addEventListener('abort', () => { clearTimeout(timer); timedOut = true; reject(signal.reason); }, { once: true });
    });
    throw new Error('unexpected success');
  } });
  const input = request('/api/vod?source=liangzi&q=slow', { headers: { Origin: blog } });
  const response = await query(input, { allowedOrigins: [blog] });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), blog);
  assert.match((await response.json()).error, /稍后重试/);
  assert.equal((await query(input)).status, 200);
});

test('worker entry uses environment origins and shares the real adapter pipeline', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    assert.equal(url.hostname, 'cj.lziapi.com');
    return new Response('{"list":[{"vod_id":123,"vod_name":"测试"}]}');
  });
  const { default: worker } = await import('../worker.js');
  const env = { VIDEO_ALLOWED_ORIGINS: blog + ', http://127.0.0.1:4017' };
  const input = request('/api/vod?source=liangzi&q=worker', { headers: { Origin: blog } });
  const response = await worker.fetch(input, env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).list[0].vod_id, 123);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), blog);
  const cached = await worker.fetch(input);
  assert.equal(cached.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls, 1);
  const local = await worker.fetch(request('/healthz', { headers: { Origin: 'http://127.0.0.1:4017' } }), env);
  assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4017');
});

test('portable adapter routes integrate directory, details and on-demand episodes without following redirects', async () => {
  const query = createVideoQuery({ fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (url.hostname === 'zip0.com') return new Response(url.pathname === '/watch' ? zipDetail : JSON.stringify(zipSearch));
    if (url.hostname === 'www.aeete.com') return new Response(url.pathname.includes('play-') ? auetePlay : url.pathname.endsWith('.html') ? aueteList : aueteDetail);
    return new Response(url.pathname.startsWith('/vodplay/') ? piankuPlay : url.pathname.startsWith('/voddetail/') ? piankuDetail : piankuList);
  } });
  for (const params of [{ source: 'pianku', q: 'test' }, { source: 'auete', mode: 'browse', category: 'tv' }, { source: 'zip0', q: 'test' }, { source: 'zip0', id: 'dyttzy:12' }]) {
    const response = await query(request('/api/vod?' + new URLSearchParams(params)));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).list.length, 1);
  }
  for (const [source, id] of [['pianku', '12'], ['auete', 'Tv/neidi/test']]) {
    const path = '/api/play?' + new URLSearchParams({ source, id, line: '0', episode: '0' });
    assert.equal((await query(request(path))).status, 200);
    assert.equal((await (await query(request(path))).json()).url, 'https://cdn.example/1.m3u8');
    assert.equal((await query(request(path.replace('episode=0', 'episode=99')))).status, 404);
  }
  assert.equal((await query(request('/api/play?source=pianku&id=12&line=-1&episode=0'))).status, 400);
  assert.equal((await query(request('/api/vod?source=auete&q=test'))).status, 400);
  const blocked = createVideoQuery({ fetchImpl: async () => new Response('private challenge page') });
  assert.equal((await blocked(request('/api/vod?source=pianku&q=test'))).status, 502);
  assert.equal((await blocked(request('/api/play?source=pianku&id=12&line=0&episode=0'))).status, 502);
});
