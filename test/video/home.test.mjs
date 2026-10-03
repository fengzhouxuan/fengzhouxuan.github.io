import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeLoader, requestHomeSources } from '../../source/video/home.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const video = title => ({ title, year: '2026', source: 'liangzi', id: '1', uid: 'liangzi:1' });

test('home sections appear independently and keep editorial order despite reversed response order', async () => {
  const queries = []; let updates = 0;
  const loader = createHomeLoader({ request: options => new Promise(resolve => queries.push({ options, resolve })), onChange: () => updates++ });
  assert.equal(loader.state.sections.short.phase, 'idle');
  const first = loader.open(); assert.equal(loader.open(), first);
  await tick(); assert.equal(queries.length, 9); assert.equal(loader.state.loading, true);
  queries[5].resolve({ videos: [video('肖申克的救赎'), video('无关结果')] });
  queries[8].resolve({ videos: [video('原创 AI 故事')] }); await tick();
  assert.deepEqual(loader.state.picks.map(item => item.title), ['肖申克的救赎']);
  assert.equal(loader.state.short[0].title, '原创 AI 故事'); assert.equal(loader.state.sections.short.loading, false);
  assert.equal(loader.state.sections.tv.loading, true); assert.equal(loader.state.loading, true);
  for (const [index, job] of queries.entries()) if (![5, 8].includes(index)) job.resolve({ videos: [video(job.options.query || job.options.category)] });
  await first;
  assert.deepEqual(loader.state.picks.map(item => item.title), ['琅琊榜', '漫长的季节', '武林外传', '楚门的世界', '星际穿越', '肖申克的救赎']);
  assert.equal(loader.state.loading, false); assert.equal(loader.state.sections.picks.phase, 'ready'); assert.ok(updates >= 10);
  await loader.open(); await loader.retry('picks'); assert.equal(queries.length, 9);
});

test('failed and empty sections can be retried individually without reloading successful results', async () => {
  const calls = []; let retry = false;
  const loader = createHomeLoader({ request: async options => {
    calls.push(options);
    if (options.category === 'short' && !retry) throw new Error('external failure');
    if (options.category === 'movie' && !retry) return { videos: [] };
    return { videos: [video(options.query || options.category)] };
  } });
  await loader.open(); const savedPicks = loader.state.picks; const savedTV = loader.state.tv[0];
  assert.equal(loader.state.sections.short.phase, 'failed'); assert.equal(loader.state.sections.short.failed, 1);
  assert.equal(loader.state.sections.movie.phase, 'empty'); assert.equal(loader.state.sections.movie.empty, 1);
  await loader.open(); assert.equal(calls.length, 9);
  retry = true; await loader.retry('short');
  assert.equal(calls.length, 10); assert.equal(calls.at(-1).category, 'short');
  assert.equal(loader.state.sections.short.phase, 'ready'); assert.equal(loader.state.sections.short.failed, 0);
  assert.equal(loader.state.sections.movie.phase, 'empty'); assert.deepEqual(loader.state.picks, savedPicks); assert.equal(loader.state.tv[0], savedTV);
  await loader.retry('movie'); assert.equal(calls.length, 11); assert.equal(loader.state.sections.movie.empty, 0);
});

test('featured retries query only missing or failed titles and preserve all successful titles', async () => {
  const calls = []; let retry = false;
  const loader = createHomeLoader({ request: async options => {
    calls.push(options);
    if (!retry && options.query === '武林外传') throw new Error('unavailable');
    if (!retry && options.query === '星际穿越') return { videos: [video('星际穿越续集')] };
    return { videos: [video(options.query || options.category)] };
  } });
  await loader.open(); assert.equal(loader.state.picks.length, 4); assert.equal(loader.state.sections.picks.failed, 1); assert.equal(loader.state.sections.picks.empty, 1);
  retry = true; await loader.retry('picks');
  assert.deepEqual(calls.slice(9).map(options => options.query), ['武林外传', '星际穿越']);
  assert.equal(loader.state.picks.length, 6); assert.equal(loader.state.sections.picks.phase, 'ready');
});

test('a repeated retry during loading shares requests and does not clear ready neighbours', async () => {
  let resolve; let retry = false; let calls = 0;
  const loader = createHomeLoader({ request: options => {
    if (options.category !== 'short') return Promise.resolve({ videos: [video(options.query || options.category)] });
    calls++;
    return retry ? new Promise(done => { resolve = done; }) : Promise.reject(new Error('offline'));
  } });
  await loader.open(); retry = true;
  const first = loader.retry('short'); const second = loader.retry('short'); const opening = loader.open();
  await tick(); assert.equal(calls, 2); assert.equal(loader.state.sections.short.loading, true); assert.equal(loader.state.tv.length, 1);
  resolve({ videos: [video('恢复后的 AI 故事')] }); await Promise.all([first, second, opening]);
  assert.equal(loader.state.sections.short.phase, 'ready'); assert.equal(loader.state.loading, false);
});

test('invalid dependencies, sections and malformed replies fail safely', async () => {
  for (const options of [undefined, {}, { request: 1 }, { request() {}, onChange: null }]) assert.throws(() => createHomeLoader(options), /方法/);
  const loader = createHomeLoader({ request: async () => null });
  await loader.open(); assert.equal(loader.state.loading, false);
  for (const section of ['picks', 'tv', 'movie', 'short']) assert.equal(loader.state.sections[section].phase, 'failed');
  for (const section of ['unknown', 'constructor', null]) assert.throws(() => loader.retry(section), /栏目/);
  const empty = createHomeLoader({ request: async () => ({ videos: [] }) }); await empty.open();
  assert.equal(empty.state.sections.picks.phase, 'empty'); assert.equal(empty.state.sections.picks.empty, 6);
});

test('home source fallback tries empty or unrelated results and respects healthy source order', async () => {
  const calls = [];
  const result = await requestHomeSources(['ruyi', 'liangzi', 'feifan'], { query: '琅琊榜' }, async source => {
    calls.push(source); return { videos: [video(source === 'liangzi' ? '琅琊榜' : '琅琊榜续集')] };
  });
  assert.deepEqual(calls, ['ruyi', 'liangzi']); assert.equal(result.videos[0].title, '琅琊榜');
  const empty = await requestHomeSources(['ruyi', 'ruyi', 'liangzi'], { category: 'tv' }, async source => {
    if (source === 'liangzi') throw new Error('private failure'); return { videos: [] };
  });
  assert.deepEqual(empty.videos, []);
  await assert.rejects(requestHomeSources(['liangzi'], {}, async () => null), /来源暂时无法连接/);
  await assert.rejects(requestHomeSources([], {}, async () => {}), /重试/);
});

test('home fallback validates inputs, preserves cancellation and explicit retries bypass source cooldown', async () => {
  for (const args of [[null, {}, () => {}], [[1], {}, () => {}], [[], null, () => {}], [[], {}, null]]) await assert.rejects(requestHomeSources(...args), /配置/);
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(requestHomeSources(['liangzi'], { signal: controller.signal }, async () => { calls++; }), { name: 'AbortError' }); assert.equal(calls, 0);
  const delayed = new AbortController();
  await assert.rejects(requestHomeSources(['liangzi', 'ruyi'], { signal: delayed.signal }, async () => { delayed.abort(); return { videos: [video('取消结果')] }; }), { name: 'AbortError' });
  const options = []; let recovering = false;
  const loader = createHomeLoader({ request: async value => { options.push(value); if (!recovering) throw new Error('cooling down'); return { videos: [video(value.query || value.category)] }; } });
  await loader.open(); assert.ok(options.every(value => value.retrySources === false));
  recovering = true; await loader.retry('short'); assert.equal(options.at(-1).retrySources, true);
});
