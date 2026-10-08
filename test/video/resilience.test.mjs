import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendTransport } from '../../source/video/resilience.js';
import { requestVideos, requestEpisode } from '../../source/video/core.js';
import { createVideoQuery } from '../../services/video/query.js';
import { piankuDetail, piankuPlay } from '../../services/video/tests/fixtures/site-pages.js';

const base = 'https://api.example';
const data = { list: [{ vod_id: 12, vod_name: '测试影片', vod_year: '2026', vod_remarks: '第1027集' }], pagecount: 1 };
const search = '/api/vod?source=ruyi&page=1&q=test';
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const queryFetch = query => (url, options) => new Promise((resolve, reject) => {
  if (options.signal.aborted) { reject(options.signal.reason); return; }
  const abort = () => reject(options.signal.reason);
  options.signal.addEventListener('abort', abort, { once: true });
  query(new Request(url, options)).then(response => { options.signal.removeEventListener('abort', abort); resolve(response); }, error => { options.signal.removeEventListener('abort', abort); reject(error); });
});

test('backend quota pages pause queries until UTC reset and return bounded cached data across reloads', async () => {
  let time = Date.UTC(2026, 9, 3, 12); let broken = false; let calls = 0; const storage = memory();
  const fetchImpl = async () => { calls++; return broken ? new Response('<html>Error code: 1027 daily quota</html>', { status: 403 }) : Response.json(data); };
  const first = createBackendTransport({ base, storage, now: () => time, fetchImpl });
  assert.equal((await first.fetch(base + search)).headers.get('X-Video-Fallback'), null); assert.equal(first.state.phase, 'ready');
  broken = true; const cached = await first.fetch(base + search, { cache: 'reload' }); assert.deepEqual(await cached.json(), data); assert.equal(cached.headers.get('X-Video-Fallback'), 'cache');
  assert.equal(first.state.phase, 'limited'); assert.equal(first.state.retryAt, Date.UTC(2026, 9, 4) + 1000);
  const reloaded = createBackendTransport({ base, storage, now: () => time, fetchImpl }); await reloaded.fetch(base + search); assert.equal(calls, 2);
  const account = await reloaded.fetch(base + '/api/account/favorites', { headers: { Authorization: 'Bearer secret' } }); assert.equal(account.status, 503); assert.equal(calls, 2); assert.doesNotMatch(JSON.stringify([...storage.values]), /secret/);
  time = Date.UTC(2026, 9, 4, 0, 0, 2); broken = false; await reloaded.fetch(base + search); assert.equal(reloaded.state.phase, 'ready'); assert.equal(calls, 3);
});

test('CORS or connection failures trigger provider direct requests and mark the actual degraded result', async () => {
  const calls = []; const transport = createBackendTransport({ base, fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options }); if (String(url).startsWith(base)) throw new TypeError('CORS blocked private detail'); return Response.json(data);
  } });
  const result = await requestVideos('liangzi', { base, query: '凡人', fetchImpl: transport.fetch });
  assert.equal(result.degraded, 'direct'); assert.equal(result.videos.length, 1); assert.equal(transport.state.phase, 'unavailable');
  assert.equal(new URL(calls[1].url).searchParams.get('wd'), '凡人'); assert.equal(calls[1].options.credentials, 'omit');
  await transport.fetch(base + '/api/vod?source=liangzi&id=12&page=1'); assert.equal(new URL(calls.at(-1).url).searchParams.get('ids'), '12');
  await transport.fetch(base + '/api/vod?source=liangzi&mode=browse&category=anime&type=29&page=1'); assert.equal(new URL(calls.at(-1).url).searchParams.get('t'), '29');
  assert.equal((await transport.fetch(base + '/api/vod?source=liangzi&mode=browse&category=bad&page=1')).status, 503);
  assert.equal((await transport.fetch(base + search)).status, 503);
});

test('failed direct requests use the matching cache without caching auth data or lazy playback URLs', async () => {
  let failed = false; const storage = memory();
  const transport = createBackendTransport({ base, storage, fetchImpl: async () => { if (failed) throw new Error('offline'); return Response.json(data); } });
  const path = '/api/vod?source=liangzi&page=1&q=test'; await transport.fetch(base + path); failed = true;
  assert.equal((await transport.fetch(base + path, { cache: 'reload' })).headers.get('X-Video-Fallback'), 'cache');
  assert.equal((await transport.fetch(base + '/api/play?source=auete&id=12')).status, 503);
  assert.equal((await transport.fetch(base + '/api/vod?source=ruyi&page=1&q=new')).status, 503);
  assert.equal((await transport.fetch(base + '/api/account/exchange', { method: 'POST', body: 'secret-ticket' })).status, 503);
  assert.doesNotMatch(JSON.stringify([...storage.values]), /secret-ticket|api\/account|api\/play/);
});

test('provider 502 failures and account database failures never pause the entire backend', async () => {
  for (const [path, status, payload] of [[search, 502, { error: '这个来源失败' }], ['/api/account/favorites', 503, { code: 'account_unavailable', error: '数据库不可用' }], ['/api/account/favorites', 401, { code: 'session_expired', error: '登录过期' }], [search, 400, { error: '错误参数' }]]) {
    const transport = createBackendTransport({ base, fetchImpl: async () => Response.json(payload, { status }) });
    assert.equal((await transport.fetch(base + path)).status, status); assert.equal(transport.state.phase, 'ready');
  }
});

test('a provider deadline returns a source failure while other sources and account sync stay available', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Deadline', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
  const query = createVideoQuery({ fetchImpl: async (url, { signal }) => {
    if (url.hostname === 'cj.lziapi.com') return Response.json(data);
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  let accountCalls = 0;
  const forward = queryFetch(query);
  const transport = createBackendTransport({ base, fetchImpl: async (url, options) => {
    if (new URL(url).pathname === '/api/account/favorites') { accountCalls++; return Response.json({ favorites: [], revision: 1 }); }
    return forward(url, options);
  } });
  const slow = transport.fetch(base + search);
  t.mock.timers.tick(10001);
  const result = await slow;
  assert.equal(result.status, 502); assert.equal(transport.state.phase, 'ready');
  assert.equal((await transport.fetch(base + '/api/vod?source=liangzi&q=test')).status, 200);
  assert.equal((await transport.fetch(base + '/api/account/favorites')).status, 200); assert.equal(accountCalls, 1);
});

test('lazy playback can finish two sequential page reads without either browser deadline cutting it off', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Deadline', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
  const query = createVideoQuery({ fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(url.pathname.startsWith('/voddetail/') ? piankuDetail : piankuPlay)), 9000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) });
  const transport = createBackendTransport({ base, fetchImpl: queryFetch(query) });
  const pending = requestEpisode('pianku', '12', '2-1', '第01集', { base, fetchImpl: transport.fetch });
  t.mock.timers.tick(9000);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(9000);
  assert.equal(await pending, 'https://cdn.example/1.m3u8'); assert.equal(transport.state.phase, 'ready');
});

test('HTML, malformed success responses and temporary overload enter a short circuit that manual retry can recover', async () => {
  for (const response of [new Response('<html>bad gateway</html>', { status: 502 }), new Response('bad json'), Response.json({}, { status: 200 }), new Response('busy', { status: 429, headers: { 'Retry-After': '120' } })]) {
    let ready = false; let calls = 0; const transport = createBackendTransport({ base, now: () => 10000, fetchImpl: async () => { calls++; return ready ? Response.json({ status: 'ok' }) : response.clone(); } });
    assert.equal((await transport.fetch(base + search)).status, 503); assert.equal(transport.state.phase, 'unavailable');
    await transport.fetch(base + search); assert.equal(calls, 1);
    ready = true; assert.equal(await transport.retry(), true); assert.equal(transport.state.phase, 'ready');
  }
});

test('cancellation is preserved and errors never expose internal details or send requests to an unconfigured origin', async () => {
  const transport = createBackendTransport({ base, fetchImpl: async () => { throw new Error('private detail'); } });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(transport.fetch(base + search, { signal: cancelled.signal }), { name: 'AbortError' }); assert.equal(transport.state.phase, 'ready');
  await assert.rejects(transport.fetch('https://bad.example' + search), /地址/);
  assert.doesNotMatch(await (await transport.fetch(base + search)).text(), /private/);
  assert.equal(await transport.retry(), false);
  const during = new AbortController(); const midflight = createBackendTransport({ base, fetchImpl: async () => { during.abort(); throw during.signal.reason; } });
  await assert.rejects(midflight.fetch(base + search, { signal: during.signal }), { name: 'AbortError' }); assert.equal(midflight.state.phase, 'ready');
});

test('cache is bounded, expires, ignores corrupted records, and browser storage failures still retain in-memory data', async () => {
  for (const storage of [null, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } }, { getItem: () => '{bad' }, { getItem: () => JSON.stringify({ bad: true }) }]) {
    let failed = false; const transport = createBackendTransport({ base, storage, fetchImpl: async () => { if (failed) throw new Error('offline'); return Response.json(data); } });
    await transport.fetch(base + search); failed = true; assert.equal((await transport.fetch(base + search, { cache: 'reload' })).headers.get('X-Video-Fallback'), 'cache');
  }
  const storage = memory(); let time = 1000000; let failed = false;
  const transport = createBackendTransport({ base, storage, now: () => time, fetchImpl: async () => { if (failed) throw new Error('offline'); return Response.json(data); } });
  for (let index = 0; index < 30; index++) await transport.fetch(base + search + index);
  assert.equal(JSON.parse(storage.getItem('video-query-cache-v1')).length, 24);
  failed = true; time += 86400001; assert.equal((await transport.fetch(base + search + 29)).status, 503);
  const corrupted = memory(); corrupted.setItem('video-query-cache-v1', JSON.stringify([{ key: search, text: '{}', at: time }]));
  const invalid = createBackendTransport({ base, storage: corrupted, now: () => time, fetchImpl: async () => { throw new Error('offline'); } }); assert.equal((await invalid.fetch(base + search)).status, 503);
});

test('fresh public search and browse pages avoid Worker calls across reloads and expire after one minute', async () => {
  let time = 1000000; let calls = 0; const storage = memory();
  const fetchImpl = async () => { calls++; return Response.json(data); };
  const transport = createBackendTransport({ base, storage, now: () => time, fetchImpl });
  const browse = '/api/vod?source=ruyi&mode=browse&category=anime&type=29&page=1';
  for (const path of [search, browse]) {
    await transport.fetch(base + path);
    const fresh = await transport.fetch(base + path);
    assert.deepEqual(await fresh.json(), data); assert.equal(fresh.headers.get('X-Video-Cache'), 'fresh');
    assert.equal(fresh.headers.get('X-Video-Fallback'), null);
  }
  assert.equal(calls, 2); assert.equal(transport.state.phase, 'ready');
  const reloaded = createBackendTransport({ base, storage, now: () => time, fetchImpl });
  await reloaded.fetch(base + search); assert.equal(calls, 2);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(reloaded.fetch(base + search, { signal: cancelled.signal }), { name: 'AbortError' });
  time += 60000;
  await reloaded.fetch(base + search); assert.equal(calls, 3);
  await reloaded.fetch(base + search + '&page_extra=2'); assert.equal(calls, 4);
});

test('fresh cache excludes detail, playback, account and authenticated requests and honors cache bypass', async () => {
  let calls = 0; const storage = memory();
  const transport = createBackendTransport({ base, storage, fetchImpl: async () => { calls++; return Response.json({ ...data, url: 'https://cdn.example/video.m3u8' }); } });
  await transport.fetch(base + search);
  for (const cache of ['reload', 'no-cache', 'no-store']) await transport.fetch(base + search, { cache });
  assert.equal(calls, 4);
  for (const path of [search + '&id=12', '/api/play?source=pianku&id=12', '/api/account/favorites']) {
    await transport.fetch(base + path); await transport.fetch(base + path);
  }
  for (let index = 0; index < 2; index++) await transport.fetch(base + search, { headers: { Authorization: 'Bearer private-token' } });
  assert.equal(calls, 12); assert.doesNotMatch(JSON.stringify([...storage.values]), /private-token|api\/account|api\/play/);
  const before = storage.getItem('video-query-cache-v1');
  await transport.fetch(base + search + '&q_extra=new', { cache: 'no-store' });
  assert.equal(storage.getItem('video-query-cache-v1'), before);
});
