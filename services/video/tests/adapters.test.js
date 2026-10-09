import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdapterRequest, parsePianku, parseAuete, parseZipSearch, parseZipDetail, buildEpisodePage, parseEpisodeURL } from '../adapters.js';
import { requestVideos } from '../core.js';
import { piankuList, piankuDetail, piankuPlay, aueteList, aueteDetail, auetePlay, zipSearch, zipDetail } from './fixtures/site-pages.js';

const request = fields => buildAdapterRequest(new URLSearchParams(fields));

test('adapter requests constrain identities, hosts, categories and query lengths', () => {
  assert.equal(request({ source: 'pianku', id: '12' }).url.pathname, '/voddetail/12.html');
  assert.equal(request({ source: 'auete', id: 'Tv/neidi/test' }).url.pathname, '/Tv/neidi/test/');
  assert.equal(request({ source: 'zip0', id: 'dyttzy:12' }).url.searchParams.get('source'), 'dyttzy');
  assert.equal(request({ source: 'pianku', q: '测试', page: '2' }).url.searchParams.get('wd'), '测试');
  assert.equal(request({ source: 'zip0', q: '测试', page: '2' }).url.searchParams.get('page'), '2');
  assert.equal(request({ source: 'pianku', mode: 'browse', category: 'tv' }).url.pathname, '/vodtype/38.html');
  assert.equal(request({ source: 'pianku', mode: 'browse', category: 'tv', page: '2' }).url.pathname, '/vodtype/38-2.html');
  assert.equal(request({ source: 'auete', mode: 'browse', category: 'anime', type: '29' }).url.pathname, '/Dm/guoman/index.html');
  assert.equal(request({ source: 'auete', mode: 'browse', category: 'anime', type: '29', page: '2' }).url.pathname, '/Dm/guoman/index2.html');
  for (const fields of [{ source: 'unknown' }, { source: 'auete', id: '../x' }, { source: 'pianku', q: 'x', page: '21' }, { source: 'pianku', q: '' }, { source: 'zip0', q: 'x'.repeat(61) }, { source: 'auete', q: 'x' }, { source: 'pianku', mode: 'browse', category: 'adult' }, { source: 'zip0', mode: 'browse', category: 'tv' }, { source: 'pianku', mode: 'browse', category: 'movie', type: '13' }]) assert.throws(() => request(fields));
});

test('public HTML directories and details keep metadata and lazy episodes only', () => {
  const p = parsePianku(piankuList); assert.equal(p.list[0].vod_year, '2015'); assert.equal(p.list[0].vod_area, '大陆'); assert.equal(p.pagecount, 20);
  assert.equal(parsePianku(piankuList.replace('2015 / 大陆', '国产剧 / 2015'), { category: '国产剧' }).list[0].vod_area, '');
  assert.equal(parsePianku(piankuList.replace(' title="测试剧"', '').replace('测试剧', '<h4 class="title">标题</h4>')).list.length, 1);
  const detail = parsePianku(piankuDetail, { id: '12' }).list[0];
  assert.equal(detail.vod_name, '测试剧'); assert.equal(detail.vod_content, '故事'); assert.equal(detail.vod_actor, '主演');
  assert.deepEqual(detail.vod_lines, [{ name: '线路2', episodes: [{ name: '第01集', ref: '2-1' }, { name: '第02集', ref: '2-2' }] }]);
  assert.match(parsePianku(piankuDetail.replace(' data-target="playlist-2"', ''), { id: '12' }).list[0].vod_lines[0].name, /线路/);
  const a = parseAuete(aueteList, { category: '国产剧' }); assert.equal(a.list.length, 1); assert.equal(a.pagecount, 3); assert.equal(a.list[0].vod_pic, 'https://cdn.example/poster.jpg');
  const ad = parseAuete(aueteDetail, { id: 'Tv/neidi/test' }).list[0];
  assert.equal(ad.vod_name, '测试剧'); assert.equal(ad.vod_year, '2015'); assert.equal(ad.vod_actor, '主演'); assert.equal(ad.vod_lines[0].episodes.length, 2);
  assert.equal(parseAuete(aueteList.replace(/<img[^>]+>/g, ''), {}).list[0].vod_pic, '');
  assert.equal(parseAuete(aueteList.replace(' alt="测试剧"', ''), {}).list[0].vod_name, '');
  for (const parse of [parseAuete, parsePianku]) { assert.throws(() => parse('<title>安全验证</title>')); assert.throws(() => parse('<title>安全验证</title>', { id: '12' })); }
});

test('HTML pagination retains the actual scope so the client distinguishes its twenty-page query limit', async () => {
  for (const data of [parsePianku(piankuList.replace('-20.html', '-100.html')), parseAuete(aueteList.replace('index3.html', 'index100.html'))]) {
    assert.equal(data.pagecount, 100);
    const result = await requestVideos('pianku', { query: '测试', fetchImpl: async () => new Response(JSON.stringify(data)) });
    assert.equal(result.pages, 20); assert.equal(result.limited, true);
  }
});

test('Auete update time comes only from the detail status, without treating publication year or recommendations as updates', () => {
  const html = aueteDetail + '<div class="detail-status-item"><span class="label">更新：</span><b><i class="clock"></i> 2026-09-24 00:43</b></div>';
  assert.equal(parseAuete(html, { id: 'Tv/neidi/test' }).list[0].vod_time, '2026-09-24 00:43');
  assert.equal(parseAuete(aueteDetail + '<p>更新：2026-09-30</p>', { id: 'Tv/neidi/test' }).list[0].vod_time, '');
  assert.equal(parseAuete(aueteDetail + '<div class="detail-status-item"><span>年份：</span>2015</div>', { id: 'Tv/neidi/test' }).list[0].vod_time, '');
});

test('ZIP0 discovery validates watch URLs and reads quoted SSR values without evaluating scripts', () => {
  const data = parseZipSearch(zipSearch); assert.equal(data.list[0].vod_id, 'dyttzy:12'); assert.equal(data.pagecount, 2);
  const rejected = ['kuaiche', 'unknown'];
  const mixed = { ...zipSearch, data: [...zipSearch.data, ...rejected.map(source => ({ title: '已淘汰影片', url: 'https://zip0.com/watch?source=' + source + '&id=12' }))] };
  assert.deepEqual(parseZipSearch(mixed).list.map(item => item.vod_id), ['dyttzy:12']);
  for (const source of rejected) assert.throws(() => parseZipDetail(zipDetail.replace('source:"dyttzy"', 'source:"' + source + '"'), source + ':12'), /未登记/);
  for (const source of ['subo', 'diyi']) {
    const restored = { ...zipSearch, data: [{ title: '保留来源', url: 'https://zip0.com/watch?source=' + source + '&id=12' }] };
    assert.equal(parseZipSearch(restored).list[0].vod_id, source + ':12');
    assert.equal(parseZipDetail(zipDetail.replace('source:"dyttzy"', 'source:"' + source + '"'), source + ':12').list[0].vod_id, source + ':12');
  }
  assert.equal(parseZipSearch({ success: true, data: [{ url: 'bad' }, { url: 'https://evil.example/watch?source=a&id=1' }, { url: 'https://zip0.com/other?source=a&id=1' }, { url: 'https://zip0.com/watch?source=a&id=../1' }]}).list.length, 0);
  assert.throws(() => parseZipSearch({ success: false }));
  const detail = parseZipDetail(zipDetail, 'dyttzy:12').list[0]; assert.equal(detail.vod_name, '测试剧'); assert.match(detail.vod_content, /包含"引号"/); assert.match(detail.vod_play_url, /第1集\$https:/);
  assert.throws(() => parseZipDetail(zipDetail, 'other:12')); assert.throws(() => parseZipDetail('<script>throw Error("must not execute")</script>', 'a:1'));
});

test('current episode pages accept only safe direct media and never execute player scripts', () => {
  assert.equal(buildEpisodePage('pianku', '12', '2-1').pathname, '/vodplay/12-2-1.html');
  assert.equal(buildEpisodePage('auete', 'Tv/neidi/test', '0-0').pathname, '/Tv/neidi/test/play-0-0.html');
  for (const args of [['pianku', '../12', '2-1'], ['auete', 'Tv/neidi/test', '//evil'], ['zip0', 'dyttzy:12', '1-1']]) assert.throws(() => buildEpisodePage(...args));
  assert.equal(parseEpisodeURL('pianku', piankuPlay), 'https://cdn.example/1.m3u8');
  assert.equal(parseEpisodeURL('auete', auetePlay), 'https://cdn.example/1.m3u8');
  assert.throws(() => parseEpisodeURL('pianku', piankuPlay.replace('1.m3u8', 'player.php?url=1.m3u8')));
  for (const [source, html] of [['pianku', '<script>alert(1)</script>'], ['auete', '<script>alert(1)</script>'], ['pianku', piankuPlay.replace('"encrypt":0', '"encrypt":1')], ['pianku', piankuPlay.replace('https://cdn.example/1.m3u8', 'https://name:secret@cdn.example/1.m3u8')], ['pianku', piankuPlay.replace('1.m3u8', 'player.html')], ['auete', auetePlay.replace(/base64decode\("[^"]+"\)/, 'base64decode("aHR0cDovL2V4YW1wbGUuY29tL2EubTN1OA==")')], ['unknown', '']]) assert.throws(() => parseEpisodeURL(source, html));
});
