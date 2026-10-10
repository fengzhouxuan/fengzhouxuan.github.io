import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, CATEGORIES, supportsSource, requestVideos, groupVideos, filterVideos } from '../core.js';
import { createVideoQuery } from '../query.js';

const request = path => new Request('https://video.example' + path);
const raw = {
  vod_id: 8298, vod_name: '凡人修仙传', type_id: 29, type_name: '国产动漫', vod_year: '2020', vod_area: '大陆',
  vod_pic: 'https://media.example/poster.jpg', vod_remarks: '更新至第195集', vod_time: '2026-10-10 11:13:37', vod_isend: 0, vod_weekday: '周六',
  vod_actor: '演员', vod_director: '导演', vod_content: '简介', vod_down_url: 'unused',
  vod_play_from: 'xigua$$$xiguam3u8$$$unknown',
  vod_play_url: '第01集$https://media.example/share/1$$$第01集$https://media.example/1.m3u8#第02集$https://media.example/2.m3u8$$$第01集$https://unknown.example/1.m3u8',
};

test('metadata lists preserve cards, source identity, real pagination and cache without fetching details', async () => {
  let calls = 0;
  const query = createVideoQuery({ fetchImpl: async url => {
    calls++; assert.equal(url.searchParams.get('ac'), 'detail');
    assert.equal(url.searchParams.get('wd'), '凡人'); assert.equal(url.searchParams.get('pg'), '2'); assert.equal(url.searchParams.has('ids'), false);
    return Response.json({ page: 2, total: 27, pagecount: 2, list: [raw, { ...raw, vod_id: 1, type_id: 34 },
      { ...raw, vod_id: 2, type_id: null }, { ...raw, vod_id: 3, vod_play_from: 'unknown' },
      { ...raw, vod_id: 4, vod_play_from: 'constructor' }, { ...raw, vod_id: 5, vod_play_url: null },
      { ...raw, vod_id: 6, vod_play_from: { toString: null } }, null],
      class: [{ type_id: 29 }, { type_id: 34 }],
    });
  } });
  const path = '/api/vod?source=xigua&q=凡人&page=2&listMetadataOnly=false';
  for (const origin of ['https://blog.example', 'https://elsewhere.example']) {
    const response = await query(new Request('https://video.example' + path, { headers: { Origin: origin } }), { allowedOrigins: ['https://blog.example'] });
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.list.length, 1);
    assert.equal(data.page, 2); assert.equal(data.total, 27); assert.equal(data.pagecount, 2);
    assert.deepEqual(data.class, [{ type_id: 29 }]);
    assert.deepEqual(Object.keys(data.list[0]), ['vod_id', 'vod_name', 'type_id', 'type_name', 'vod_year', 'vod_area', 'vod_pic', 'vod_remarks', 'vod_time', 'vod_isend', 'vod_weekday']);
    assert.doesNotMatch(JSON.stringify(data.list), /m3u8|unused|unknown|演员|导演|简介/);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin === 'https://blog.example' ? origin : null);
  }
  assert.equal(calls, 1);
  const fetchImpl = input => query(new Request(input));
  const result = await requestVideos('xigua', { query: '凡人', page: 2, base: 'https://video.example', fetchImpl });
  const card = result.videos[0];
  assert.equal(calls, 1); assert.equal(result.pages, 2); assert.equal(card.uid, 'xigua:8298');
  assert.equal(card.year, '2020'); assert.equal(card.poster, raw.vod_pic); assert.equal(card.updateSchedule, '每周六更新');
  assert.deepEqual(card.lines, []); assert.equal(filterVideos(result.videos, { year: '2020', area: 'mainland', status: 'updating' }).length, 1);
  const other = { ...card, source: 'liangzi', id: '12', uid: 'liangzi:12', origin: 'liangzi' };
  assert.equal(groupVideos([card, other]).length, 1); assert.equal(groupVideos([card, other])[0].variants.length, 2);
});

test('opening detail after a metadata card fetches full information and only approved aligned episodes', async () => {
  const calls = [];
  const query = createVideoQuery({ fetchImpl: async url => {
    calls.push(url); return Response.json({ list: [raw], pagecount: 1 });
  } });
  const fetchImpl = input => query(new Request(input));
  const card = await requestVideos('xigua', { query: '凡人', base: 'https://video.example', fetchImpl });
  const detail = await requestVideos('xigua', { id: card.videos[0].id, base: 'https://video.example', fetchImpl });
  const current = detail.videos[0];
  assert.equal(calls.length, 2); assert.equal(calls[1].searchParams.get('ids'), '8298'); assert.equal(calls[1].searchParams.has('wd'), false);
  assert.equal(current.uid, card.videos[0].uid); assert.equal(current.actors, '演员'); assert.equal(current.director, '导演'); assert.equal(current.description, '简介');
  assert.equal(current.lines.length, 1); assert.equal(current.lines[0].name, '西瓜直链');
  assert.deepEqual(current.lines[0].episodes.map(episode => episode.name), ['第01集', '第02集']);
  assert.equal(current.lines[0].episodes[1].url, 'https://media.example/2.m3u8');
  await requestVideos('xigua', { id: '8298', base: 'https://video.example', fetchImpl }); assert.equal(calls.length, 2);
  assert.equal((await query(request('/api/vod?source=xigua&id=8298&listMetadataOnly=true'))).status, 200);
  assert.equal(calls.length, 2);
});

test('Xigua scopes preserve precise category mappings and reject unsupported scopes before egress', async () => {
  const calls = [];
  const query = createVideoQuery({ fetchImpl: async url => { calls.push(url); return Response.json({ list: [raw], pagecount: 100, total: 1981 }); } });
  const source = SOURCES.find(item => item.id === 'xigua');
  assert.equal(source.listMetadataOnly, true); assert.deepEqual(source.browseTypes, [13, 46]);
  for (const category of CATEGORIES) for (const [type] of category.types) {
    const before = calls.length;
    const response = await query(request('/api/vod?' + new URLSearchParams({ source: 'xigua', mode: 'browse', category: category.id, type })));
    const supported = supportsSource(source, { view: 'browse', type });
    assert.equal(response.status, supported ? 200 : 400); assert.equal(calls.length, before + (supported ? 1 : 0));
    if (supported) {
      assert.equal(calls.at(-1).searchParams.get('t'), String(type === 46 ? 36 : type));
      assert.equal((await response.json()).list[0].vod_play_url, undefined);
    }
  }
  const before = calls.length;
  assert.equal((await query(request('/api/vod?source=zip0&id=xgzy:8298'))).status, 400); assert.equal(calls.length, before);
});

test('metadata projection remains opt in, tolerates malformed list entries and does not cache failures', async () => {
  const source = { id: 'metadata-policy', api: 'https://example.com/api.php/provide/vod/', listMetadataOnly: true };
  SOURCES.push(source);
  try {
    let calls = 0;
    const query = createVideoQuery({ fetchImpl: async () => { calls++; return new Response(calls === 1 ? 'invalid upstream' : JSON.stringify({ list: [null, 1, [], 'invalid', { vod_id: 12, vod_name: '普通影片', vod_play_url: 'unused' }] })); } });
    const path = '/api/vod?source=metadata-policy&q=测试';
    assert.equal((await query(request(path))).status, 502);
    const response = await query(request(path)); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).list, [{ vod_id: 12, vod_name: '普通影片' }]);
    assert.equal((await query(request(path))).status, 200); assert.equal(calls, 2);
    source.listMetadataOnly = 'true';
    const unchanged = createVideoQuery({ fetchImpl: async () => Response.json({ list: [raw] }) });
    const data = await (await unchanged(request(path))).json(); assert.deepEqual(data.list, [raw]);
    const other = await (await unchanged(request('/api/vod?source=liangzi&q=测试&listMetadataOnly=true'))).json();
    assert.deepEqual(other.list, [raw]);
  } finally { SOURCES.splice(SOURCES.indexOf(source), 1); }
});
