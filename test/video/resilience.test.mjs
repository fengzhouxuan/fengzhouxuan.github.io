import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendTransport } from '../../source/video/resilience.js';
import { requestVideos } from '../../source/video/core.js';

const base = 'https://api.example';
const data = { list: [{ vod_id: 12, vod_name: '测试影片', vod_year: '2026', vod_remarks: '第1027集' }], pagecount: 1 };
const search = '/api/vod?source=ruyi&page=1&q=test';
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test('backend quota pages pause queries until UTC reset and return bounded cached data across reloads', async () => {
  let time = Date.UTC(2026, 9, 3, 12); let broken = false; let calls = 0; const storage = memory();
  const fetchImpl = async () => { calls++; return broken ? new Response('<html>Error code: 1027 daily quota</html>', { status: 403 }) : Response.json(data); };
  const first = createBackendTransport({ base, storage, now: () => time, fetchImpl });
  assert.equal((await first.fetch(base + search)).headers.get('X-Video-Fallback'), null); assert.equal(first.state.phase, 'ready');
  broken = true; const cached = await first.fetch(base + search); assert.deepEqual(await cached.json(), data); assert.equal(cached.headers.get('X-Video-Fallback'), 'cache');
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
  assert.equal((await transport.fetch(base + path)).headers.get('X-Video-Fallback'), 'cache');
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
    await transport.fetch(base + search); failed = true; assert.equal((await transport.fetch(base + search)).headers.get('X-Video-Fallback'), 'cache');
  }
  const storage = memory(); let time = 1000000; let failed = false;
  const transport = createBackendTransport({ base, storage, now: () => time, fetchImpl: async () => { if (failed) throw new Error('offline'); return Response.json(data); } });
  for (let index = 0; index < 30; index++) await transport.fetch(base + search + index);
  assert.equal(JSON.parse(storage.getItem('video-query-cache-v1')).length, 24);
  failed = true; time += 86400001; assert.equal((await transport.fetch(base + search + 29)).status, 503);
  const corrupted = memory(); corrupted.setItem('video-query-cache-v1', JSON.stringify([{ key: search, text: '{}', at: time }]));
  const invalid = createBackendTransport({ base, storage: corrupted, now: () => time, fetchImpl: async () => { throw new Error('offline'); } }); assert.equal((await invalid.fetch(base + search)).status, 503);
});
