import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, CATEGORIES, supportsSource, requestVideos, contentNotice } from '../core.js';
import { createVideoQuery, buildUpstream } from '../query.js';

const request = path => new Request('https://video.example' + path);

test('channel policies filter cached metadata and keep real upstream pagination and fixed limits', async () => {
  const source = { id: 'channel-policy', api: 'https://example.com/api.php/provide/vod/?limit=3', allowedTypeIds: [13] };
  SOURCES.push(source);
  try {
    let calls = 0;
    const query = createVideoQuery({ fetchImpl: async url => {
      calls++; assert.equal(url.searchParams.get('limit'), '3');
      return Response.json({ page: 2, pagecount: 18, total: 54, limit: '3', list: [
        { vod_id: 1, type_id: '13', vod_name: '普通影片' },
        { vod_id: 2, type_id: 39, vod_name: '未开放频道' }, { vod_id: 3 }, null,
        { vod_id: 4, type_id: { toString: null, valueOf: null } },
      ], class: [{ type_id: 13, type_name: '国产剧' }, { type_id: 39 }, null] });
    } });
    for (const origin of ['https://blog.example', 'https://elsewhere.example']) {
      const response = await query(new Request('https://video.example/api/vod?source=channel-policy&q=凡人&page=2&limit=100', { headers: { Origin: origin } }), { allowedOrigins: ['https://blog.example'] });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.list, [{ vod_id: 1, type_id: '13', vod_name: '普通影片' }]);
      assert.deepEqual(data.class, [{ type_id: 13, type_name: '国产剧' }]);
      assert.equal(data.page, 2); assert.equal(data.pagecount, 18); assert.equal(data.total, 54);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin === 'https://blog.example' ? origin : null);
    }
    assert.equal(calls, 1);
    const empty = createVideoQuery({ fetchImpl: async () => Response.json({ list: [{ vod_id: 2, type_id: 39 }], pagecount: 1, total: 1 }) });
    assert.deepEqual((await (await empty(request('/api/vod?source=channel-policy&id=2'))).json()).list, []);
  } finally { SOURCES.splice(SOURCES.indexOf(source), 1); }
});

test('aggregation policies retain aligned approved lines and omit unknown, inherited and malformed entries', async () => {
  const source = { id: 'line-policy', api: 'https://example.com/api.php/provide/vod/', allowedPlayFrom: { known: '已验证上游', other: '另一上游' } };
  SOURCES.push(source);
  try {
    const query = createVideoQuery({ fetchImpl: async () => Response.json({ pagecount: 18, total: 54, list: [
      { vod_id: 1, vod_play_from: 'unknown$$$known$$$other', vod_play_url: '第01集$https://unregistered.example/1.m3u8$$$第01集$https://media.example/1.m3u8$$$第01集$https://media.example/2.m3u8' },
      { vod_id: 2, vod_play_from: 'unknown', vod_play_url: 'x' }, { vod_id: 3, vod_play_from: 'known' },
      { vod_id: 4, vod_play_url: 'x' }, null, { vod_id: 5, vod_play_from: 'constructor', vod_play_url: 'x' },
      { vod_id: 6, vod_play_from: { toString: null }, vod_play_url: 'x' },
    ] }) });
    const data = await (await query(request('/api/vod?source=line-policy&q=凡人'))).json();
    assert.equal(data.list.length, 1);
    assert.equal(data.list[0].vod_play_from, '已验证上游$$$另一上游');
    assert.equal(data.list[0].vod_play_url, '第01集$https://media.example/1.m3u8$$$第01集$https://media.example/2.m3u8');
    assert.equal(data.total, 54); assert.equal(data.pagecount, 18);
  } finally { SOURCES.splice(SOURCES.indexOf(source), 1); }
});

test('admitted discovery sources use their verified categories, search restrictions and aggregation boundary', async () => {
  const calls = [];
  const query = createVideoQuery({ fetchImpl: async url => {
    calls.push(url);
    return Response.json({ pagecount: 18, total: 54, list: [{ vod_id: 11767, type_id: 26, type_name: '国产动漫', vod_name: '凡人修仙传', vod_year: '2020', vod_play_from: 'kcm3u8$$$wjm3u8', vod_play_url: '第01集$https://unregistered.example/1.m3u8$$$第01集$https://media.example/1.m3u8#第02集$https://media.example/2.m3u8' }] });
  } });
  assert.equal((await query(request('/api/vod?source=iqiyi&q=凡人'))).status, 400);
  assert.match((await (await query(request('/api/vod?source=iqiyi&q=凡人'))).json()).error, /本站暂未启用/);
  assert.equal(calls.length, 0);
  for (const id of ['iqiyi', 'lovedan']) {
    const source = SOURCES.find(item => item.id === id);
    assert.equal(source.browseTypes.length, 16); assert.equal(new URL(source.api).protocol, 'https:');
    for (const category of CATEGORIES) for (const [type] of category.types) {
      const before = calls.length;
      const response = await query(request('/api/vod?' + new URLSearchParams({ source: id, mode: 'browse', category: category.id, type })));
      const supported = supportsSource(source, { view: 'browse', type });
      assert.equal(response.status, supported ? 200 : 400); assert.equal(calls.length, before + (supported ? 1 : 0));
      if (supported) assert.equal(calls.at(-1).searchParams.get('t'), String(source.browseTypeMap[type] ?? type));
    }
  }
  const result = await requestVideos('lovedan', { query: '凡人', page: 2, base: 'https://video.example', fetchImpl: input => query(request(new URL(input).pathname + new URL(input).search)) });
  assert.equal(result.pages, 18); assert.equal(result.videos[0].uid, 'lovedan:11767');
  assert.equal(result.videos[0].lines.length, 1); assert.equal(result.videos[0].lines[0].name, '无尽资源');
  assert.equal(result.videos[0].lines[0].episodes[1].name, '第02集');
  assert.equal(calls.at(-1).searchParams.get('limit'), '3'); assert.equal(calls.at(-1).searchParams.get('pg'), '2');
  assert.equal(buildUpstream(new URLSearchParams({ source: 'iqiyi', id: '4538' })).searchParams.get('ids'), '4538');
  const before = calls.length;
  for (const alias of ['iqyzy:4538', 'aidan:11767']) assert.equal((await query(request('/api/vod?' + new URLSearchParams({ source: 'zip0', id: alias })))).status, 400);
  assert.equal(calls.length, before);
  assert.equal(contentNotice({ source: 'iqiyi', id: '4538' }, '第01集').observed, true);
  assert.equal(contentNotice({ source: 'iqiyi', id: '4538' }, '第02集').observed, false);
});
