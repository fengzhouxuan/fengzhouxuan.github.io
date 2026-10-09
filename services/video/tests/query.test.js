import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoQuery, buildUpstream } from '../query.js';
import { SOURCES, CATEGORIES, supportsSource, requestVideos, groupVideos } from '../core.js';
import { piankuList, piankuDetail, piankuPlay, aueteList, aueteDetail, auetePlay, zipSearch, zipDetail } from './fixtures/site-pages.js';

const blog = 'https://fengzhouxuan.github.io';
const request = (path, options = {}) => new Request('https://video-api.example' + path, options);

test('expanded source categories use their own verified IDs and reject unsupported scopes before making a request', async () => {
  const categories = CATEGORIES.flatMap(category => category.types.map(([type]) => ({ category: category.id, type })));
  const sources = ['dyttzy', '360zy', 'modu', 'zuid', 'uku', 'jszy', 'xinlang', 'jinying', 'guangsu', 'ikun', 'hongniu', 'baofeng', 'haohua', 'wujin'];
  const fixtures = [
    ['dyttzy', 29, 29, 46, 36, null], ['360zy', 29, 38, 46, 46, null],
    ['modu', 29, 1, 46, 38, 42], ['zuid', 29, 29, 46, 54, null],
    ['uku', 13, 13, 46, 32, null], ['jszy', 29, 24, null, null, 54],
    ['xinlang', 29, 38, null, null, 57], ['jinying', 29, 24, null, null, 48],
    ['guangsu', 29, 41, null, null, 52], ['ikun', 29, 35, 46, 45, null],
    ['hongniu', 29, 36, null, null, 51],
    ['baofeng', 29, 40, 46, 58, 74], ['haohua', 29, 24, null, null, 53],
    ['wujin', 29, 29, 46, 41, null],
  ];
  for (const [source, type, upstreamType, short, shortType, aiType] of fixtures) {
    const category = type === 13 ? 'tv' : 'anime';
    assert.equal(buildUpstream(new URLSearchParams({ source, mode: 'browse', category, type })).searchParams.get('t'), String(upstreamType));
    if (short) assert.equal(buildUpstream(new URLSearchParams({ source, mode: 'browse', category: 'short', type: short })).searchParams.get('t'), String(shortType));
    if (aiType) assert.equal(buildUpstream(new URLSearchParams({ source, mode: 'browse', category: 'short', type: 52 })).searchParams.get('t'), String(aiType));
  }
  let calls = 0;
  const query = createVideoQuery({ fetchImpl: async () => { calls++; return Response.json({ list: [] }); } });
  for (const id of sources) {
    const source = SOURCES.find(item => item.id === id);
    assert.equal(new URL(source.api).protocol, 'https:'); assert.ok(Array.isArray(source.browseTypes));
    for (const { category, type } of categories) {
      const path = '/api/vod?' + new URLSearchParams({ source: id, mode: 'browse', category, type });
      const before = calls;
      const response = await query(request(path));
      if (supportsSource(source, { view: 'browse', type })) { assert.equal(response.status, 200); assert.equal(calls, before + 1); }
      else { assert.equal(response.status, 400); assert.equal(calls, before); }
    }
  }
  assert.equal(new Set(SOURCES.map(source => source.id)).size, SOURCES.length);
  assert.equal(new Set(SOURCES.filter(source => source.api).map(source => source.api)).size, SOURCES.filter(source => source.api).length);
});

test('expanded sources keep search and detail identity and deduplicate a matching ZIP0 upstream', async () => {
  const ids = ['dyttzy', '360zy', 'modu', 'zuid', 'uku', 'jszy', 'xinlang', 'jinying', 'guangsu', 'ikun', 'hongniu', 'baofeng', 'haohua', 'wujin'];
  for (const source of ids) {
    const calls = [];
    const query = createVideoQuery({ fetchImpl: async url => {
      calls.push(url); return Response.json({ list: [{ vod_id: 12, vod_name: '测试影片', vod_year: '2026', vod_play_from: 'hls', vod_play_url: '第01集$https://cdn.example/1.m3u8' }], pagecount: 1 });
    } });
    const fetchImpl = input => query(request(new URL(input).pathname + new URL(input).search));
    const searchResult = await requestVideos(source, { query: '凡人 & 修仙', base: 'https://video-api.example', fetchImpl });
    assert.equal(searchResult.videos[0].uid, source + ':12'); assert.equal(calls[0].searchParams.get('wd'), '凡人 & 修仙');
    const detail = await requestVideos(source, { id: '12', base: 'https://video-api.example', fetchImpl });
    assert.equal(calls[1].searchParams.get('ids'), '12'); assert.equal(calls[1].searchParams.has('wd'), false);
    assert.equal(detail.videos[0].lines[0].episodes[0].url, 'https://cdn.example/1.m3u8');
    const aggregated = { ...detail.videos[0], source: 'zip0', id: source + ':12', uid: 'zip0:' + source + ':12', origin: source };
    assert.equal(groupVideos([aggregated, detail.videos[0]])[0].variants.length, 1);
    assert.equal(groupVideos([aggregated, detail.videos[0]])[0].variants[0].source, source);
  }
});

test('browse-only JSON sources reject search without spending an upstream request and preserve normal detail access', async () => {
  const calls = []; const query = createVideoQuery({ fetchImpl: async url => { calls.push(url); return Response.json({ list: [{ vod_id: 104, vod_name: '测试影片' }], pagecount: 1 }); } });
  const fixture = { id: 'test-browse-only', api: 'https://example.com/api', search: false };
  SOURCES.push(fixture);
  try {
    const source = fixture.id;
    const before = calls.length;
    const response = await query(request('/api/vod?' + new URLSearchParams({ source, q: '凡人' })));
    assert.equal(response.status, 400); assert.match((await response.json()).error, /未开放搜索/); assert.equal(calls.length, before);
    assert.equal((await query(request('/api/vod?' + new URLSearchParams({ source, id: '104' })))).status, 200);
    assert.equal(calls.at(-1).searchParams.get('ids'), '104'); assert.equal(calls.at(-1).searchParams.has('wd'), false);
  } finally {
    SOURCES.splice(SOURCES.indexOf(fixture), 1);
  }
  const before = calls.length;
  assert.equal((await query(request('/api/vod?source=diyi&id=104'))).status, 400);
  assert.equal((await query(request('/api/vod?source=subo&id=161094'))).status, 400);
  assert.equal((await query(request('/api/vod?source=kuaiche&id=132088'))).status, 400);
  assert.equal(calls.length, before);
});

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
    const path = '/api/play?' + new URLSearchParams({ source, id, ref: source === 'pianku' ? '2-1' : '0-0', name: '第01集' });
    assert.equal((await query(request(path))).status, 200);
    assert.equal((await (await query(request(path))).json()).url, 'https://cdn.example/1.m3u8');
    assert.equal((await query(request(path.replace(/ref=[^&]+/, 'ref=9-99')))).status, 404);
  }
  assert.equal((await query(request('/api/play?source=pianku&id=12&line=-1&episode=0'))).status, 400);
  assert.equal((await query(request('/api/vod?source=auete&q=test'))).status, 400);
  const blocked = createVideoQuery({ fetchImpl: async () => new Response('private challenge page') });
  assert.equal((await blocked(request('/api/vod?source=pianku&q=test'))).status, 502);
  assert.equal((await blocked(request('/api/play?source=pianku&id=12&ref=2-1&name=1'))).status, 502);
});

test('lazy playback uses the displayed reference and name across reordered or expired directories, and rejects stale index clients', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  let mode = 'original'; const played = [];
  const first = '<a href="/vodplay/12-2-1.html">第01集</a>'; const second = '<a href="/vodplay/12-2-2.html">第02集</a>';
  const query = createVideoQuery({ fetchImpl: async url => {
    if (url.pathname.startsWith('/voddetail/')) return new Response(mode === 'removed' ? piankuDetail.replace(first, '') : mode === 'reused' ? piankuDetail.replace('第01集', '第03集') : mode === 'reordered' ? piankuDetail.replace(first + second, second + first) : piankuDetail);
    played.push(url.pathname); return new Response(piankuPlay);
  } });
  const detail = request('/api/vod?source=pianku&id=12');
  assert.equal((await query(detail)).status, 200);
  const play = request('/api/play?source=pianku&id=12&ref=2-1&name=1');
  mode = 'reordered'; now += 300001;
  assert.equal((await query(play)).status, 200); assert.deepEqual(played, ['/vodplay/12-2-1.html']);
  for (const next of ['removed', 'reused']) {
    mode = next; now += 300001;
    assert.equal((await query(play)).status, 404); assert.equal(played.length, 1);
  }
  assert.equal((await query(request('/api/play?source=pianku&id=12&line=0&episode=0'))).status, 400);
  for (const params of ['ref=../1&name=1', 'ref=2-1', 'name=1', 'ref=2-1&name=' + 'x'.repeat(121)]) assert.equal((await query(request('/api/play?source=pianku&id=12&' + params))).status, 400);
});
