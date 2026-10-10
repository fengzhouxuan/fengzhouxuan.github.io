import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedVideoId, contentNotice } from '../../source/video/core.js';
import { SOURCES, CATEGORIES, videoKey, parseRoute, filterVideos, episodeRanges, validVideoId, supportsSource, sourceLabel, requestEpisode, sameEpisodeName, safeURL, plainText, parseUpdateSchedule, releaseSchedule, parseLines, normalizeVideo, normalizeResponse, groupVideos, matchEpisode, nextEpisode, requestVideos, loadSaved, saveItems, mergeSavedItems, rememberProgress, createListNavigation } from '../../source/video/core.js';

const raw = {
  vod_id: 12, vod_name: '<b>琅琊榜</b>', vod_year: '2015', type_name: '国产剧',
  vod_pic: 'https://example.com/cover.jpg', vod_play_from: 'web$$$hls',
  vod_play_url: '第01集$https://example.com/share/1$$$第01集$https://example.com/1.m3u8#第02集$https://example.com/2.m3u8?token=a$b',
};
const fixture = () => normalizeVideo(raw, 'liangzi');

test('return navigation survives reloads for catalog, search, favorites and history within one tab', () => {
  const saved = new Map(); const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const navigation = createListNavigation(storage); assert.equal(navigation.get(), '#home');
  for (const hash of ['#browse?category=short&type=52', '#search?q=' + encodeURIComponent('琅琊榜 & 续集'), '#library', '#library?tab=history', '#home']) {
    navigation.remember(hash); const restored = createListNavigation(storage);
    assert.deepEqual(parseRoute(restored.get()), parseRoute(hash)); assert.equal(saved.size, 1);
  }
});

test('return navigation never stores external destinations, player links or arbitrary parameters', () => {
  const navigation = createListNavigation();
  for (const hash of [null, 12, 'https://example.com/', 'javascript:alert(1)', '#watch?source=liangzi&id=12', '#detail?source=ruyi&id=12', '#search?q=' + 'a'.repeat(1025)]) assert.equal(navigation.remember(hash), '#home');
  assert.equal(navigation.remember('#browse?category=missing&type=-1&secret=1'), '#browse?category=tv&type=13');
  assert.equal(navigation.remember('#library?tab=missing'), '#library');
  assert.equal(navigation.remember('#search?q=' + 'a'.repeat(100) + '&token=private'), '#search?q=' + 'a'.repeat(80));
});

test('missing or blocked tab storage keeps an in-memory return route and degrades to home on reload', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const navigation = createListNavigation(storage); assert.equal(navigation.get(), '#home');
  assert.equal(navigation.remember('#library?tab=history'), '#library?tab=history');
  assert.equal(createListNavigation(storage).get(), '#home');
});

test('catalogue state survives detail reloads with bounded filters, source choices, pages and position', () => {
  const saved = new Map(); const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const navigation = createListNavigation(storage); const hash = '#browse?category=anime&type=29&ignored=private';
  navigation.remember(hash); navigation.rememberCatalog(hash, {
    filters: { year: '2026', area: 'mainland', status: 'updating', media: 'https://private.example/1.m3u8' }, top: 3200,
    pages: { liangzi: 3, ruyi: 1, feifan: 0, unknown: 99 }, sources: ['ruyi', 'liangzi', 'ruyi', 'unknown'], expanded: true,
    videos: [raw], secret: 'private-token',
  });
  const restored = createListNavigation(storage);
  assert.equal(restored.get(), '#browse?category=anime&type=29');
  assert.deepEqual(restored.catalog('#browse?category=anime'), {
    hash: '#browse?category=anime&type=29', filters: { year: '2026', area: 'mainland', status: 'updating' }, top: 3200,
    pages: { liangzi: 3, ruyi: 1, feifan: 0 }, sources: ['liangzi', 'ruyi'], expanded: true, anchor: null,
  });
  assert.equal(restored.catalog('#browse?category=movie'), null);
  const copy = restored.catalog(hash); copy.filters.year = '2015'; copy.pages.liangzi = 20; copy.sources.push('feifan');
  assert.equal(restored.catalog(hash).filters.year, '2026'); assert.equal(restored.catalog(hash).pages.liangzi, 3);
  assert.deepEqual(restored.catalog(hash).sources, ['liangzi', 'ruyi']);
  assert.doesNotMatch(saved.get('video-catalog-context'), /private|m3u8|vod_play/);
});

test('corrupt, external and oversized catalogue state degrades without adopting invalid filters or page counts', () => {
  for (const data of ['broken', 'null', '12', '[]', 'a'.repeat(4097), JSON.stringify({ hash: 'https://example.com/' }), JSON.stringify({ hash: '#watch?source=liangzi&id=12' })]) {
    const navigation = createListNavigation({ getItem: key => key === 'video-catalog-context' ? data : null });
    assert.equal(navigation.catalog('#browse?category=anime'), null);
  }
  const navigation = createListNavigation();
  for (const hash of ['#home', '#library', '#detail?source=ruyi&id=12', null]) assert.equal(navigation.rememberCatalog(hash), null);
  const restored = navigation.rememberCatalog('#search?q=测试&token=hidden', { filters: { year: 2026, area: 'constructor', status: 'unknown' }, top: Infinity, pages: { liangzi: 21, ruyi: -1, feifan: '2' }, sources: 'liangzi', expanded: 'true' });
  assert.deepEqual(restored, { hash: '#search?q=' + encodeURIComponent('测试'), filters: { year: '', area: '', status: '' }, top: 0, pages: {}, sources: [], expanded: false, anchor: null });
  assert.deepEqual(filterVideos([fixture()], { area: 'toString' }), []);
});

test('switching between catalogues and searches retains each route context through reloads', () => {
  const saved = new Map(); const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const navigation = createListNavigation(storage);
  const browse = '#browse?category=anime'; const search = '#search?q=' + encodeURIComponent('琅琊榜');
  navigation.rememberCatalog(browse, { filters: { year: '2026', area: 'mainland', status: 'updating' }, pages: { liangzi: 3 }, sources: ['liangzi'], top: 900, expanded: true });
  navigation.rememberCatalog(search, { filters: { year: '2015', status: 'complete' }, pages: { ruyi: 2 }, sources: ['ruyi'], top: 350 });
  for (const current of [navigation, createListNavigation(storage)]) {
    assert.equal(current.catalog(browse).filters.year, '2026'); assert.equal(current.catalog(browse).top, 900);
    assert.equal(current.catalog(browse).pages.liangzi, 3); assert.equal(current.catalog(browse).expanded, true);
    assert.equal(current.catalog(search).filters.year, '2015'); assert.equal(current.catalog(search).top, 350);
    assert.deepEqual(current.catalog(search).sources, ['ruyi']);
  }
  navigation.rememberCatalog(browse, { filters: { year: '2025' }, top: 700 });
  const restored = createListNavigation(storage);
  assert.equal(restored.catalog(browse).filters.year, '2025'); assert.equal(restored.catalog(search).top, 350);
  assert.equal(navigation.rememberCatalog('#home'), null); assert.equal(navigation.catalog(search).top, 350);
});

test('catalogue history migrates legacy state, bounds recent routes and sanitizes persisted entries', () => {
  const saved = new Map([['video-catalog-context', JSON.stringify({ hash: '#browse?category=anime', filters: { year: '2026' }, top: 123 })]]);
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const navigation = createListNavigation(storage);
  assert.equal(navigation.catalog('#browse?category=anime').top, 123);
  navigation.rememberCatalog('#search?q=one', { filters: { year: '2015' }, secret: 'private-token' });
  assert.equal(createListNavigation(storage).catalog('#browse?category=anime').top, 123);
  for (let index = 0; index < 7; index++) navigation.rememberCatalog('#search?q=' + index, { top: index });
  assert.equal(navigation.catalog('#browse?category=anime'), null);
  navigation.rememberCatalog('#search?q=one', { top: 100 });
  navigation.rememberCatalog('#search?q=new', { top: 200 });
  const restored = createListNavigation(storage);
  assert.equal(restored.catalog('#search?q=0'), null); assert.equal(restored.catalog('#search?q=one').top, 100);
  assert.equal(restored.catalog('#search?q=new').top, 200);
  const serialized = saved.get('video-catalog-context');
  assert.doesNotMatch(serialized, /private-token/); assert.equal(JSON.parse(serialized).entries.length, 8);
  const mixed = JSON.stringify({ version: 2, entries: [null, { hash: '#watch?source=ruyi&id=12' }, { hash: '#search?q=safe', filters: { area: 'constructor' }, top: Infinity }, { hash: '#search?q=safe', top: 42 }] });
  const sanitized = createListNavigation({ getItem: key => key === 'video-catalog-context' ? mixed : null });
  assert.equal(sanitized.catalog('#search?q=safe').top, 42); assert.equal(sanitized.catalog('#browse?category=anime'), null);
  for (const data of [JSON.stringify({ version: 3, entries: [] }), JSON.stringify({ version: 2, entries: 'invalid' }), 'a'.repeat(32769)]) {
    assert.equal(createListNavigation({ getItem: key => key === 'video-catalog-context' ? data : null }).catalog('#search?q=safe'), null);
  }
});

test('missing or blocked catalogue storage keeps only the current in-memory context', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  for (const store of [null, storage]) {
    const navigation = createListNavigation(store); assert.equal(navigation.catalog('#search?q=测试'), null);
    navigation.rememberCatalog('#search?q=测试', { filters: { year: '2015' }, top: 100, pages: { liangzi: 1 }, sources: ['liangzi'] });
    assert.equal(navigation.catalog('#search?q=测试').top, 100);
    assert.equal(createListNavigation(store).catalog('#search?q=测试'), null);
    const empty = navigation.rememberCatalog('#browse?category=tv', null); assert.equal(empty.top, 0); assert.deepEqual(empty.filters, { year: '', area: '', status: '' });
  }
});

test('catalogue anchors preserve a visible film and focus without accepting oversized or invalid coordinates', () => {
  const saved = new Map(); const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const navigation = createListNavigation(storage); const hash = '#browse?category=anime';
  const anchor = { key: '大夏守墓人|2026', offset: 94.5, focus: 'poster' };
  navigation.rememberCatalog(hash, { anchor });
  assert.deepEqual(createListNavigation(storage).catalog(hash).anchor, anchor);
  const copy = navigation.catalog(hash); copy.anchor.offset = 100;
  assert.equal(navigation.catalog(hash).anchor.offset, 94.5);
  for (const focus of ['title', 'favorite', 'unknown']) {
    const result = navigation.rememberCatalog(hash, { anchor: { ...anchor, offset: -100, focus } });
    assert.equal(result.anchor.focus, focus === 'unknown' ? '' : focus); assert.equal(result.anchor.offset, -100);
  }
  for (const value of [null, {}, { ...anchor, offset: Infinity }, { ...anchor, offset: 10001 }, { ...anchor, key: 'x'.repeat(301) + '|2026' }, { ...anchor, key: 'bad year|2026' }, { ...anchor, key: '影片|old' }]) assert.equal(navigation.rememberCatalog(hash, { anchor: value }).anchor, null);
  assert.equal(navigation.rememberCatalog(hash, { anchor: { ...anchor, key: '暂无年份|', offset: 10000 } }).anchor.key, '暂无年份|');
});

test('home context restores selected film and visible anchor without saving source URLs or metadata', () => {
  const saved = new Map(); const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const navigation = createListNavigation(storage);
  const context = { top: 1300, hero: '漫长的季节|2023', control: 'hero-detail', anchor: { key: '原创短故事|2026', offset: 98.5, focus: 'poster', section: 'short' } };
  assert.equal(navigation.home(), null);
  assert.deepEqual(navigation.rememberHome({ ...context, videos: [raw], token: 'private', poster: 'https://private.example/a.jpg' }), context);
  const restored = createListNavigation(storage); assert.deepEqual(restored.home(), context);
  const copy = restored.home(); copy.anchor.offset = 999; assert.equal(restored.home().anchor.offset, 98.5);
  assert.doesNotMatch(saved.get('video-home-context'), /private|https|vod_/);
  for (const section of ['picks', 'short', 'tv', 'movie', 'continue']) {
    const result = navigation.rememberHome({ ...context, anchor: { ...context.anchor, section, focus: 'continue' } });
    assert.equal(result.anchor.section, section); assert.equal(result.anchor.focus, 'continue');
  }
});

test('corrupt or blocked home storage and invalid controls degrade without adopting arbitrary selectors', () => {
  for (const value of ['broken', 'null', '12', '[]', 'a'.repeat(2049)]) {
    assert.equal(createListNavigation({ getItem: key => key === 'video-home-context' ? value : null }).home(), null);
  }
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  for (const storage of [null, blocked]) {
    const navigation = createListNavigation(storage);
    assert.equal(navigation.rememberHome(null), null);
    assert.deepEqual(navigation.rememberHome({ top: Infinity, hero: 'invalid|year', control: '#private', anchor: { key: '影片|2026', offset: 1, focus: 'title', section: 'arbitrary' } }), { top: 0, hero: '', control: '', anchor: null });
    const result = navigation.rememberHome({ top: 500, hero: '影片|', control: 'hero-play', anchor: { key: '影片|2026', offset: -99, focus: 'unsafe', section: 'tv' } });
    assert.equal(result.anchor.focus, ''); assert.equal(result.hero, '影片|'); assert.equal(result.control, 'hero-play');
    assert.equal(navigation.home().top, 500); assert.equal(createListNavigation(storage).home(), null);
  }
});

test('only HTTPS URLs without embedded credentials are accepted', () => {
  assert.equal(safeURL('https://example.com/a.m3u8'), 'https://example.com/a.m3u8');
  for (const value of ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', '/relative', 'https://u:p@example.com', null]) assert.equal(safeURL(value), '');
  assert.equal(plainText('<p>A&nbsp; &amp; &quot;B&quot;&#39;</p>'), 'A & "B"\'');
  assert.equal(plainText(null), '');
});

test('episode parsing keeps direct media, delimiters in query strings and separate lines', () => {
  const lines = parseLines(raw.vod_play_from, raw.vod_play_url);
  assert.equal(lines.length, 1); assert.equal(lines[0].name, 'hls');
  assert.equal(lines[0].episodes[1].url, 'https://example.com/2.m3u8?token=a$b');
  assert.deepEqual(parseLines('', 'https://example.com/a.mp4'), [{ name: '线路 1', episodes: [{ name: '第1集', url: 'https://example.com/a.mp4' }] }]);
  assert.deepEqual(parseLines(null, null), []);
  assert.deepEqual(parseLines('x', 'bad$javascript:alert(1)#<b>x</b>$http://example.com/a.m3u8'), []);
});

test('source normalization rejects malformed IDs and excluded content, never trusts remote HTML', () => {
  const item = fixture(); assert.equal(item.uid, 'liangzi:12'); assert.equal(item.title, '琅琊榜');
  assert.equal(normalizeVideo(null, 'liangzi'), null);
  assert.equal(normalizeVideo(raw, 'unknown'), null);
  for (const patch of [{ vod_id: '../1' }, { vod_name: '' }, { type_name: '伦理片' }, { vod_name: '琅琊榜[电影解说]' }]) assert.equal(normalizeVideo({ ...raw, ...patch }, 'liangzi'), null);
  assert.deepEqual(normalizeResponse({ list: [raw, raw, null, { ...raw, vod_id: '13' }] }, 'ruyi').map(item => item.id), ['12', '13']);
  assert.throws(() => normalizeResponse({}, 'liangzi'), /格式/);
});

test('grouping preserves source identity and does not merge different years', () => {
  const item = fixture();
  const groups = groupVideos([item, item, { ...item, uid: 'ruyi:23', source: 'ruyi', id: '23' }, { ...item, year: '2020' }]);
  assert.equal(groups.length, 2); assert.equal(groups[0].variants.length, 2);
  assert.deepEqual(groupVideos([]), []);
});

test('new source promotion observations remain scoped to inspected movies and episodes', () => {
  for (const [source, id] of [['suoni', '35419'], ['dazhong', '12267']]) {
    assert.equal(contentNotice({ source, id }, '第1集').observed, true);
    assert.equal(contentNotice({ source, id }, '第2集').observed, false);
    assert.equal(contentNotice({ source, id: '99' }).label, '来源有推广记录');
    assert.equal(allowedVideoId(source, id), true);
  }
  assert.equal(contentNotice({ source: 'shandian', id: '35419' }).label, '推广情况未核验');
  assert.equal(allowedVideoId('dbzy', '152475'), false);
});

test('reviewed title aliases group the 2020 animation while preserving editions and source identities', () => {
  const item = { ...fixture(), title: '凡人修仙传', year: '2020', category: '国产动漫' };
  const variants = ['凡人修仙传2020', '凡人修仙传（2020）', '凡人修仙传(2020)'].map((title, index) => ({ ...item, title, source: 'ruyi', id: String(30 + index), uid: 'ruyi:' + (30 + index) }));
  const grouped = groupVideos([item, ...variants]);
  assert.equal(grouped.length, 1); assert.equal(grouped[0].variants.length, 4);
  assert.deepEqual(grouped[0].variants.map(value => value.title), [item.title, ...variants.map(value => value.title)]);
  for (const changed of [{ title: '凡人修仙传重制版' }, { title: '凡人修仙传第一季' }, { title: '凡人修仙传2020', year: '2025' }, { title: '凡人修仙传2020', year: '' }, { title: '凡人修仙传2020', category: '国产剧' }]) {
    assert.notEqual(videoKey({ ...item, ...changed }), videoKey(item));
  }
  assert.notEqual(videoKey({ title: '2001', year: '2001' }), videoKey({ title: '', year: '2001' }));
  assert.notEqual(videoKey({ title: '1917', year: '2019' }), videoKey({ title: '191', year: '2019' }));
  assert.notEqual(videoKey({ title: '影片2020', year: '2020' }), videoKey({ title: '影片', year: '2020' }));
});

test('legacy aliases retain the most recent saved progress and honor removals across tabs', () => {
  const old = { ...fixture(), title: '凡人修仙传2020', year: '2020', category: '国漫', episode: '第10集', position: 45 };
  const latest = { ...old, title: '凡人修仙传', episode: '第12集', position: 120 };
  const older = { ...old, uid: 'ruyi:13', source: 'ruyi', id: '13', position: 30 };
  const storage = { getItem: () => JSON.stringify([latest, older]) };
  assert.deepEqual(loadSaved(storage, 'history'), [latest, older]);
  assert.deepEqual(mergeSavedItems([old], [old], [latest, older]), [latest]);
  assert.deepEqual(mergeSavedItems([old, older], [], [latest, older]), []);
  assert.deepEqual(mergeSavedItems([old], [latest], []), []);
  assert.deepEqual(rememberProgress([old, older], latest, '第13集', 25, 100).map(value => value.episode), ['第13集']);
});

test('legacy catalog and home anchors follow reviewed aliases after a reload', () => {
  const anchor = { key: '凡人修仙传2020|2020', offset: 94, focus: 'poster' };
  const storage = { getItem: key => key === 'video-catalog-context' ? JSON.stringify({ hash: '#search?q=凡人', anchor })
    : key === 'video-home-context' ? JSON.stringify({ hero: anchor.key, anchor: { ...anchor, section: 'picks' } }) : null };
  const navigation = createListNavigation(storage);
  assert.deepEqual(navigation.catalog('#search?q=凡人').anchor, { ...anchor, key: '凡人修仙传|2020' });
  assert.equal(navigation.home().hero, '凡人修仙传|2020');
  assert.equal(navigation.home().anchor.key, '凡人修仙传|2020');
});

test('update schedules accept explicit release text and named weekdays, never infer a schedule from dates', () => {
  assert.equal(parseUpdateSchedule('首播3集，每周三 09:00 更新1集，会员抢先看2集'), '每周三 09:00 更新1集');
  assert.equal(parseUpdateSchedule('<b>每星期一、四晚上8点更新2集</b>'), '每星期一、四晚上8点更新2集');
  assert.equal(parseUpdateSchedule('每週六中午12:00播出'), '每周六中午12:00播出');
  assert.equal(parseUpdateSchedule('每天18:00更新'), '每天18:00更新');
  assert.equal(parseUpdateSchedule('一,四,天,四', true), '每周一、四、日更新');
  assert.equal(parseUpdateSchedule('星期三', true), '每周三更新');
  assert.equal(parseUpdateSchedule('周三 09:00', true), '每周三 09:00更新');
  assert.equal(parseUpdateSchedule('三 09:00', true), '每周三 09:00更新');
  for (const text of [null, '', '更新至12集', '2026-09-30 10:00', '一,四', '每周三去冒险更新日记', 'javascript:alert(1)']) assert.equal(parseUpdateSchedule(text), '');
  for (const text of [null, '', '1,3', '周八', '三<script>alert(1)</script>']) assert.equal(parseUpdateSchedule(text, true), '');
  const item = normalizeVideo({ ...raw, vod_weekday: '三', vod_time: '2026-09-30 10:00:00' }, 'ruyi');
  assert.equal(item.updateSchedule, '每周三更新'); assert.equal(item.updatedAt, '2026-09-30 10:00:00'); assert.equal(item.isComplete, false);
  assert.equal(normalizeVideo({ ...raw, vod_remarks: '更新至12集，每周五10点更新' }, 'liangzi').updateSchedule, '每周五10点更新');
  assert.equal(normalizeVideo({ ...raw, vod_content: '简介。每日20:00上线1集。' }, 'liangzi').updateSchedule, '每日20:00上线1集');
  for (const patch of [{ vod_isend: 1 }, { vod_isend: '1' }, { vod_remarks: '全18集' }, { vod_remarks: '已完结' }]) assert.equal(normalizeVideo({ ...raw, ...patch }, 'liangzi').isComplete, true);
});

test('compact source schedules retain each explicit weekday and episode count without guessing from prose', () => {
  const description = '<p>星期三 更1 星期四 更1</p><p>十年前，连续三日的血月过后。</p>';
  assert.equal(parseUpdateSchedule(description), '每周三更新1集；每周四更新1集');
  assert.equal(parseUpdateSchedule('简介。周五更新2集；周天更1集，继续冒险。'), '每周五更新2集；每周日更新1集');
  assert.equal(parseUpdateSchedule('周三更1集，周三更1集'), '每周三更新1集');
  for (const text of ['星期三', '周三去冒险，更新1集', '周八更1集', '周三更新0集', '周三更新100集', '周三更1岁', '本周三去更新日记']) assert.equal(parseUpdateSchedule(text), '');
  const item = normalizeVideo({ ...raw, vod_content: description }, 'ruyi');
  assert.equal(releaseSchedule(item).label, '每周三更新1集；每周四更新1集');
  assert.equal(releaseSchedule(item).credit, '如意资源提供');
  assert.equal(releaseSchedule({ ...item, isComplete: true }).label, '已完结');
});

test('release schedule attribution uses exact title and year, expires official supplements, and suppresses completed shows', () => {
  const item = { ...fixture(), title: '李熊猫', year: '2026', category: '国漫' };
  const entry = { title: '李熊猫', year: '2026', schedule: '每周三 09:00 更新', validUntil: '2026-11-11', sourceName: '<b>官方排期</b>', sourceURL: 'https://example.com/schedule', note: '北京时间' };
  const unknown = { label: '暂无更新安排', credit: '', url: '', note: '' };
  assert.deepEqual(releaseSchedule(item), unknown);
  assert.deepEqual(releaseSchedule(item, [entry], '2026-10-01'), { label: '每周三 09:00 更新', credit: '官方排期', url: 'https://example.com/schedule', note: '北京时间' });
  for (const values of [null, [], [null], [{ ...entry, title: '李熊猫第二季' }], [{ ...entry, year: '2025' }], [{ ...entry, validUntil: '' }], [{ ...entry, validUntil: '2026-09-30' }], [{ ...entry, schedule: '周三猜测更新' }]]) assert.deepEqual(releaseSchedule(item, values, '2026-10-01'), unknown);
  assert.equal(releaseSchedule(item, [entry], '2026-11-11').label, '每周三 09:00 更新');
  assert.deepEqual(releaseSchedule(item, [entry], '2026-11-12'), unknown);
  assert.equal(releaseSchedule(item, [{ ...entry, sourceURL: 'javascript:alert(1)' }], '2026-10-01').url, '');
  assert.equal(releaseSchedule(item, [{ ...entry, sourceName: undefined, sourceURL: undefined, note: undefined }], '2026-10-01').credit, '');
  assert.deepEqual(releaseSchedule({ ...item, updateSchedule: '每周四更新' }, [entry], '2026-10-01'), { ...unknown, label: '每周四更新', credit: '量子资源提供' });
  assert.equal(releaseSchedule({ ...item, isComplete: true, updateSchedule: '每周四更新' }, [entry], '2026-10-01').label, '已完结');
  assert.equal(releaseSchedule({ ...item, isComplete: true, category: '剧情片' }).label, '已上线');
});

test('source switching matches exact and numeric episode names and clamps the fallback index', () => {
  const episodes = [{ name: '第01集' }, { name: '第02集' }, { name: '特别篇' }];
  assert.equal(matchEpisode(episodes, '特别篇', 0), 2);
  assert.equal(matchEpisode(episodes, '第二集 2', 0), 1);
  assert.equal(matchEpisode(episodes, undefined, 100), 2);
  assert.equal(matchEpisode(episodes, 'unknown', -1), 0);
  assert.equal(matchEpisode([], '第1集'), -1);
  assert.equal(nextEpisode(0, 2), 1);
  for (const [index, length] of [[1, 2], [-1, 2], [0.5, 2], [0, 0]]) assert.equal(nextEpisode(index, length), -1);
});

test('catalog requests encode queries, parse pages, forward cancellation and handle errors', async () => {
  const controller = new AbortController(); let requested;
  const response = await requestVideos('liangzi', { query: 'a & b', base: 'https://query.example.com/', signal: controller.signal, fetchImpl: async (url, options) => {
    requested = new URL(url); assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ list: [raw], pagecount: 100 }));
  } });
  assert.equal(requested.searchParams.get('q'), 'a & b'); assert.equal(response.pages, 20); assert.equal(response.limited, true);
  const unpaged = await requestVideos('ruyi', { id: '12', fetchImpl: async url => { assert.ok(url.includes('id=12')); assert.ok(!url.includes('q=')); return new Response('{"list":[]}'); } });
  assert.equal(unpaged.limited, false);
  await assert.rejects(requestVideos('unknown'), /未知/);
  await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response('html') }), /有效数据/);
  await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response('{"error":"来源失败"}', { status: 502 }) }), /来源失败/);
  await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response('{}', { status: 502 }) }), /暂时/);
  await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => { throw new Error('offline'); } }), /暂时无法连接查询服务/);
});

test('query transport reports safe Chinese failures and preserves explicit cancellation', async () => {
  const calls = [options => requestVideos('liangzi', options), options => requestEpisode('pianku', '12', '2-1', '第01集', options)];
  for (const call of calls) {
    for (const error of [new TypeError('Load failed at private endpoint'), null]) {
      await assert.rejects(call({ fetchImpl: async () => { throw error; } }), error => error.name === 'QueryServiceError' && error.message === '暂时无法连接查询服务，请检查网络后重试');
    }
    await assert.rejects(call({ fetchImpl: async () => { throw new DOMException('private timeout', 'TimeoutError'); } }), error => error.name === 'QueryServiceError' && /查询服务响应超时/.test(error.message));
    const controller = new AbortController(); const canceled = new DOMException('canceled', 'AbortError'); controller.abort();
    await assert.rejects(call({ signal: controller.signal, fetchImpl: async () => { throw canceled; } }), error => error === canceled);
    await assert.rejects(call({ fetchImpl: async (_url, { signal }) => { Object.defineProperty(signal, 'aborted', { value: true }); throw new Error('network'); } }), /查询服务响应超时/);
  }
});

test('query service failures are distinct from source failures and never become successful empty searches', async () => {
  for (const status of [400, 403, 404, 429, 500, 503, 504]) {
    await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response('{"error":"private service diagnostics"}', { status }) }), error => {
      assert.equal(error.name, 'QueryServiceError'); assert.doesNotMatch(error.message, /private/); return true;
    });
  }
  for (const body of ['<html>gateway unavailable</html>', 'null', '{}', '{"error":"temporarily unavailable"}', '{"list":null}']) {
    await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response(body) }), error => error.name === 'QueryServiceError');
  }
  await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response('<html>bad gateway</html>', { status: 502 }) }), error => error.name === 'QueryServiceError');
  await assert.rejects(requestVideos('liangzi', { fetchImpl: async () => new Response('{"error":"这个来源暂时无法连接"}', { status: 502 }) }), error => error.name === 'Error' && error.message === '这个来源暂时无法连接');
  assert.deepEqual((await requestVideos('liangzi', { fetchImpl: async () => new Response('{"list":[],"pagecount":1}') })).videos, []);
});

test('browser storage tolerates corruption, blocked storage, invalid records and quotas', () => {
  const item = fixture(); let saved;
  const storage = { getItem: () => JSON.stringify([item, null, { ...item, source: 'unknown' }, { ...item, id: '../x' }]), setItem: (_key, data) => { saved = data; } };
  assert.deepEqual(loadSaved(storage, 'k').map(item => item.uid), ['liangzi:12']);
  assert.equal(saveItems(storage, 'k', Array(105).fill(item)), true); assert.equal(JSON.parse(saved).length, 100);
  assert.deepEqual(loadSaved({ getItem: () => 'bad' }, 'k'), []);
  assert.deepEqual(loadSaved({ getItem: () => '{}' }, 'k'), []);
  assert.deepEqual(loadSaved(null, 'k'), []);
  assert.equal(saveItems(null, 'k', []), false);
});

test('progress updates one record, keeps at most 100 and discards playlist URLs', () => {
  const item = fixture(); const history = [{ ...item, uid: 'ruyi:1', title: '另一部剧' }, { ...item, position: 1 }];
  const records = rememberProgress(history, item, '<b>第1集</b>', 120, 2400);
  assert.equal(records.length, 2); assert.equal(records[0].episode, '第1集');
  assert.equal(records[0].position, 120); assert.equal(records[0].lines, undefined);
  for (const playbackLabel of ['单条视频', '整部合集', '单部影片']) {
    const record = rememberProgress([], { ...item, playbackLabel }, '第01集', 120, 2400)[0];
    assert.equal(record.playbackLabel, playbackLabel); assert.equal(record.episode, '第01集'); assert.equal(record.lines, undefined);
  }
  for (const playbackLabel of ['', '<b>全集</b>', 'https://example.com/video.mp4']) assert.equal(rememberProgress([], { ...item, playbackLabel }, '第01集', 120, 2400)[0].playbackLabel, undefined);
  assert.equal(rememberProgress([], item, '', -4, 'invalid')[0].position, 0);
  assert.equal(rememberProgress([], item, '', Infinity, Infinity)[0].position, 0);
  assert.equal(rememberProgress([], item, '', NaN, -1)[0].duration, 0);
  assert.equal(rememberProgress(Array.from({ length: 110 }, (_, index) => ({ uid: String(index) })), item, '', 0, 0).length, 100);
});

test('saved edits preserve records added in other tabs while applying only local additions, edits and removals', () => {
  const first = fixture(); const second = { ...first, id: '13', uid: 'liangzi:13', title: '另一部故事' }; const third = { ...first, id: '14', uid: 'liangzi:14', title: '新收藏' };
  assert.deepEqual(mergeSavedItems([first], [third, first], [second, first]), [third, second, first]);
  assert.deepEqual(mergeSavedItems([first], [], [second, { ...first, position: 99 }]), [second]);
  const external = { ...first, position: 1800 };
  assert.deepEqual(mergeSavedItems([first], [first], [external]), [external]);
  const seekBack = { ...first, position: 20 };
  assert.deepEqual(mergeSavedItems([first], [seekBack], [external]), [seekBack]);
  assert.equal(first.position, undefined);
});

test('refreshes cannot resurrect externally removed favorites; explicit new favorites remain possible', () => {
  const first = fixture(); const updated = { ...first, tracking: { latest: 13, acknowledged: 12 } };
  assert.deepEqual(mergeSavedItems([first], [updated], []), []);
  assert.deepEqual(mergeSavedItems([first], [first], []), []);
  assert.deepEqual(mergeSavedItems([], [updated], []), [updated]);
  assert.deepEqual(mergeSavedItems([first], [first], [{ ...first, source: 'ruyi', id: '13', uid: 'ruyi:13' }]).map(item => item.source), ['ruyi']);
});

test('saved merges are bounded, group duplicate film identities and reject malformed lists or cycles safely', () => {
  assert.deepEqual(mergeSavedItems(), []);
  for (const values of [[null, [], []], [[], {}, []], [[], [], 'bad']]) assert.throws(() => mergeSavedItems(...values), /格式/);
  const rows = Array.from({ length: 110 }, (_, index) => ({ ...fixture(), id: String(index + 1), uid: 'liangzi:' + (index + 1), title: '故事' + index }));
  assert.equal(mergeSavedItems([], rows, []).length, 100);
  const item = fixture(); assert.equal(mergeSavedItems([], [item, item], [item]).length, 1);
  assert.deepEqual(mergeSavedItems([], [null, {}, { ...item, source: 'unknown' }, { ...item, title: null }], []), []);
  const circular = { ...item }; circular.loop = circular;
  assert.throws(() => mergeSavedItems([], [circular], []), /无法保存/);
  assert.deepEqual(loadSaved({ getItem: () => null }, 'missing', [item]), []);
  assert.deepEqual(loadSaved({ getItem() { throw new Error('blocked'); } }, 'missing', [item]), [item]);
});

test('metadata corrections use stable source identity without reviving deleted records or duplicating renamed films', () => {
  const old = { ...fixture(), year: '' }; const updated = { ...old, title: '琅琊榜修正片名', year: '2015' };
  assert.deepEqual(mergeSavedItems([old], [updated], []), []);
  assert.deepEqual(mergeSavedItems([old], [], [updated]), []);
  assert.deepEqual(mergeSavedItems([old], [old], [updated]), [updated]);
  assert.deepEqual(mergeSavedItems([old], [updated], [old]), [updated]);
});

test('site identities, capabilities, lazy episodes and duplicate upstreams are safe', async () => {
  assert.equal(validVideoId('auete', 'Tv/neidi/lanxiangrugu'), true);
  assert.equal(validVideoId('zip0', 'dyttzy:12'), true);
  for (const upstream of ['ffzy', 'lzi', 'lzzy', 'zy360', 'jisu', 'mdzy', 'bfzy', 'haohua']) assert.equal(allowedVideoId('zip0', upstream + ':12'), true);
  assert.equal(allowedVideoId('liangzi', '12'), true);
  assert.equal(allowedVideoId('unknown', '12'), false);
  assert.equal(allowedVideoId('zip0', 'dyttzy:../1'), false);
  for (const upstream of ['subo', 'diyi']) {
    assert.equal(allowedVideoId('zip0', upstream + ':12'), true);
    assert.ok(normalizeVideo({ vod_id: upstream + ':12', vod_name: '测试影片' }, 'zip0'));
  }
  for (const upstream of ['kuaiche', 'unknown', 'pianku', 'zip0']) {
    assert.equal(validVideoId('zip0', upstream + ':12'), true);
    assert.equal(allowedVideoId('zip0', upstream + ':12'), false);
    assert.equal(normalizeVideo({ vod_id: upstream + ':12', vod_name: '测试影片' }, 'zip0'), null);
    const saved = { uid: 'zip0:' + upstream + ':12', source: 'zip0', id: upstream + ':12', title: '原有收藏' };
    assert.deepEqual(loadSaved({ getItem: () => JSON.stringify([saved]) }, 'favorites'), [saved]);
  }
  for (const [source, id] of [['auete', '../secret'], ['auete', 'https://evil/1'], ['zip0', 'a:../1'], ['pianku', 'x'], ['unknown', '1']]) assert.equal(validVideoId(source, id), false);
  assert.equal(parseRoute('#watch?source=auete&id=Tv%2Fneidi%2Flanxiangrugu').view, 'watch');
  assert.equal(supportsSource(SOURCES[4], { view: 'search' }), false);
  assert.equal(supportsSource(SOURCES[5], { view: 'browse', type: 13 }), false);
  assert.equal(supportsSource(SOURCES[3], { view: 'browse', type: 13 }), true);
  assert.equal(supportsSource(SOURCES[0], { view: 'browse', type: 29 }), true);
  assert.equal(sourceLabel({ source: 'zip0', id: 'dyttzy:1' }), 'ZIP0 · dyttzy');
  assert.equal(sourceLabel({ source: 'ruyi' }), '如意资源');
  assert.equal(sourceLabel({ source: 'unknown' }), 'unknown');
  const direct = normalizeVideo(raw, 'ruyi');
  const duplicate = normalizeVideo({ ...raw, vod_id: 'ruyi:12' }, 'zip0');
  assert.equal(groupVideos([duplicate, direct])[0].variants.length, 1);
  assert.equal(groupVideos([duplicate, direct])[0].variants[0].source, 'ruyi');
  assert.equal(groupVideos([direct, duplicate])[0].variants.length, 1);
  for (const [source, alias] of [['dyttzy', 'dyttzy'], ['360zy', 'zy360'], ['jszy', 'jisu'], ['modu', 'mdzy'], ['zuid', 'zuid'], ['ikun', 'ikun'], ['baofeng', 'bfzy']]) {
    const item = normalizeVideo(raw, source);
    const aggregated = normalizeVideo({ ...raw, vod_id: alias + ':12' }, 'zip0');
    assert.equal(aggregated.origin, source);
    assert.equal(groupVideos([aggregated, item])[0].variants.length, 1);
    assert.equal(groupVideos([item, aggregated])[0].variants.length, 1);
    assert.equal(groupVideos([aggregated, item])[0].variants[0].source, source);
  }
  assert.equal(normalizeVideo({ ...raw, vod_id: 'unknown:12' }, 'zip0'), null);
  const lazy = normalizeVideo({ ...raw, vod_lines: [{ name: '<b>A</b>', episodes: [{ name: '1', ref: '2-1' }, { name: 'bad', ref: '//evil' }] }, { episodes: null }] }, 'pianku');
  assert.deepEqual(lazy.lines, [{ name: 'A', episodes: [{ name: '1', ref: '2-1' }] }]);
  const storage = { getItem: () => JSON.stringify([{ ...lazy }, { ...lazy, id: '../bad' }]) };
  assert.equal(loadSaved(storage, 'k').length, 1);
  assert.equal(await requestEpisode('pianku', '12', '2-1', '第01集', { base: 'https://local/', signal: new AbortController().signal, fetchImpl: async (url, options) => {
    const params = new URL(url).searchParams;
    assert.equal(new URL(url).pathname, '/api/play'); assert.ok(options.signal);
    assert.equal(params.get('ref'), '2-1'); assert.equal(params.get('name'), '第01集'); assert.equal(params.has('line'), false); assert.equal(params.has('episode'), false);
    return new Response('{"url":"https://cdn.example/1.m3u8"}');
  } }), 'https://cdn.example/1.m3u8');
  for (const args of [['unknown', '12', '2-1', '1'], ['auete', '../x', '0-0', '1'], ['pianku', '12', '-1', '1'], ['pianku', '12', '2-1', ''], ['pianku', '12', '2-1', 'x'.repeat(121)], ['pianku', '12', 0, 0]]) await assert.rejects(requestEpisode(...args), /参数/);
  for (const response of [new Response('bad'), new Response('{"url":"http://unsafe/a.m3u8"}'), new Response('{"url":"https://cdn.example/a.html"}'), new Response('{"url":"https://cdn.example/player.php?url=a.m3u8"}'), new Response('{"url":"https://cdn.example/a.m3u8"}', { status: 502 })]) await assert.rejects(requestEpisode('pianku', '12', '2-1', '第01集', { fetchImpl: async () => response }));
});

test('manual promotion observations preserve sources and distinguish specific episodes from uninspected content', () => {
  assert.equal(contentNotice({ source: 'diyi', id: '104' }).observed, true);
  assert.equal(contentNotice({ source: 'diyi', id: '104' }, '第2集').observed, true);
  const otherEpisode = contentNotice({ source: 'diyi', id: '104' }, '第01集');
  assert.equal(otherEpisode.observed, false); assert.equal(otherEpisode.label, '来源有推广记录');
  assert.match(otherEpisode.text, /第02集开头/); assert.match(otherEpisode.text, /当前视频未逐一检查/);
  assert.deepEqual(contentNotice({ source: 'zip0', id: 'diyi:104' }, '第2集'), contentNotice({ source: 'diyi', id: '104' }, '第2集'));
  assert.equal(contentNotice({ source: 'diyi', id: '999' }).observed, false);
  assert.match(contentNotice({ source: 'diyi', id: '999' }).text, /凡人修仙传/);
  const single = { source: 'subo', id: '161094', lines: [{ episodes: [{ name: '完整视频' }] }] };
  assert.equal(contentNotice(single, '完整视频').observed, true);
  assert.equal(contentNotice(single, '第2集').observed, false);
  assert.equal(contentNotice({ ...single, lines: [] }, '第2集').observed, false);
  assert.equal(contentNotice({ ...single, lines: undefined }, '第2集').observed, false);
  for (const item of [undefined, { source: 'unknown' }, { source: 'liangzi', id: '12' }, { source: 'zip0', id: 'ffzy:12' }]) {
    assert.equal(contentNotice(item).label, '推广情况未核验'); assert.match(contentNotice(item).text, /不代表/);
  }
  assert.equal(contentNotice({ source: 'kuaiche', id: '132088' }).label, '已发现博彩推广');
  assert.equal(contentNotice({ source: 'dbzy', id: '152475' }, '第1集').observed, true);
  assert.equal(allowedVideoId('subo', '161094'), true); assert.equal(allowedVideoId('diyi', '104'), true);
});

test('multiple observations on one film mark each checked episode without marking the remaining episodes', () => {
  for (const [source, id] of [['huya', '9480'], ['maotai', '153014'], ['maotai', '70360']]) {
    const item = { source, id };
    for (const [name, note] of [['第1集', '第01集'], ['EP2', '第02集']]) {
      const notice = contentNotice(item, name); assert.equal(notice.observed, true); assert.match(notice.text, new RegExp(note + '开头'));
    }
    assert.equal(contentNotice(item).observed, true);
    assert.equal(contentNotice(item, '第03集').observed, false);
    assert.match(contentNotice(item, '第03集').text, /当前视频未逐一检查/);
    assert.equal(contentNotice({ source, id: 'other' }, '第02集').observed, false);
  }
  const item = { source: 'huya', id: '158723', lines: [{ episodes: [{ name: '全集完结' }] }] };
  assert.equal(contentNotice(item, '全集完结').observed, true); assert.equal(contentNotice(item, '第01集').observed, false);
});

test('named playback routes and episode comparison preserve specials and regular numbers without inventing identities', () => {
  assert.equal(parseRoute('#watch?source=liangzi&id=12&episode=2&name=' + encodeURIComponent('第3集')).episodeName, '第3集');
  assert.equal(parseRoute('#watch?source=liangzi&id=12&name=' + 'x'.repeat(121)).episodeName, undefined);
  assert.equal(parseRoute('#detail?source=liangzi&id=12&name=one').episodeName, undefined);
  assert.equal(sameEpisodeName('第01集', 'EP1'), true); assert.equal(sameEpisodeName('<b>特别篇</b>', '特别篇'), true);
  for (const pair of [[null, null], ['第1集', '第2集'], ['特别篇1', '第1集'], ['预告1', '第1集'], ['2026-10-03', '第2026集']]) assert.equal(sameEpisodeName(...pair), false);
});

test('completion filters honor explicit source state consistently with normalized details', () => {
  const completed = normalizeVideo({ ...raw, vod_isend: 1, vod_remarks: '更新至2集' }, 'liangzi');
  const noRemarks = normalizeVideo({ ...raw, vod_isend: '1' }, 'liangzi');
  assert.equal(completed.isComplete, true); assert.equal(noRemarks.isComplete, true);
  assert.equal(filterVideos([completed, noRemarks], { status: 'complete' }).length, 2);
  assert.equal(filterVideos([completed, noRemarks], { status: 'updating' }).length, 0);
  assert.equal(filterVideos([{ remarks: '更新至2集', isComplete: false }], { status: 'updating' }).length, 1);
});

test('routes validate reloadable movie identities and normalize browse input', () => {
  assert.deepEqual(parseRoute('#watch?source=ruyi&id=12&episode=2'), { view: 'watch', source: 'ruyi', id: '12', episode: 1 });
  assert.equal(parseRoute('#detail?source=liangzi&id=1').episode, null);
  for (const route of ['#watch?source=x&id=1', '#detail?source=ruyi&id=../x', '#unknown', '']) assert.equal(parseRoute(route).view, 'home');
  assert.equal(parseRoute('#watch?source=ruyi&id=1&episode=-1').episode, null);
  assert.equal(parseRoute('#watch?source=ruyi&id=1&episode=10001').episode, null);
  assert.equal(parseRoute('#browse?category=movie&type=6').type, 6);
  assert.equal(parseRoute('#browse?category=movie&type=13').type, 11);
  assert.equal(parseRoute('#browse?category=bad').category, CATEGORIES[0].id);
  assert.equal(parseRoute('#search?q=%E7%90%85%E7%90%8A%E6%A6%9C').query, '琅琊榜');
  assert.equal(parseRoute(`#search?q=${'x'.repeat(90)}`).query.length, 80);
  assert.equal(parseRoute('#library?tab=history').tab, 'history');
  assert.equal(parseRoute('#library').tab, 'favorites');
});

test('short drama routes expose separate AI catalogs and source capabilities stay precise', () => {
  assert.deepEqual(parseRoute('#browse?category=short'), { view: 'browse', category: 'short', type: 46, query: '' });
  assert.equal(parseRoute('#browse?category=short&type=52').type, 52);
  assert.equal(parseRoute('#browse?category=short&type=36').type, 46);
  assert.equal(parseRoute('#browse?category=anime&type=52').type, 29);
  assert.deepEqual(SOURCES.filter(source => supportsSource(source, { view: 'browse', type: 46 })).map(source => source.id), ['liangzi', 'ruyi', 'feifan', 'dyttzy', '360zy', 'modu', 'zuid', 'uku', 'ikun', 'baofeng', 'wujin', 'shandian', 'suoni', 'maotai', 'yaya', 'lovedan', 'xigua']);
  assert.deepEqual(SOURCES.filter(source => supportsSource(source, { view: 'browse', type: 52 })).map(source => source.id), ['liangzi', 'modu', 'jszy', 'xinlang', 'jinying', 'guangsu', 'hongniu', 'baofeng', 'haohua', 'subo', 'huya', 'maotai', 'iqiyi']);
  assert.equal(supportsSource(SOURCES[1], { view: 'search', type: 52 }), true);
  assert.equal(supportsSource(SOURCES[2], { view: 'browse', type: 13 }), true);
  const ai = normalizeVideo({ ...raw, vod_name: '测试 AI 漫剧', type_name: 'AI漫剧', vod_remarks: '已完结', vod_play_url: '全集$https://example.com/all.m3u8' }, 'liangzi');
  assert.equal(ai.category, 'AI漫剧'); assert.equal(ai.lines[0].episodes[0].name, '全集');
  assert.equal(releaseSchedule(ai).label, '已完结');
});

test('filters preserve loaded data, distinguish unknown updates, and normalize areas', () => {
  const items = [{ year: '2015', area: '中国大陆', remarks: '已完结' }, { year: '2026', area: '韩国', remarks: '更新至第2集' }, { year: '2026', area: '英国', remarks: '' }];
  assert.equal(filterVideos(items).length, 3);
  assert.deepEqual(filterVideos(items, { year: '2015', area: 'mainland', status: 'complete' }), [items[0]]);
  assert.deepEqual(filterVideos(items, { status: 'updating' }), [items[1]]);
  assert.deepEqual(filterVideos(items, { area: 'west' }), [items[2]]);
  assert.equal(filterVideos(items, { area: 'invalid' }).length, 0);
  assert.equal(filterVideos(items, { area: 'japan' }).length, 0);
  assert.equal(filterVideos(items, { area: 'korea' }).length, 1);
  assert.equal(filterVideos([{ area: '香港', remarks: '全20集' }], { area: 'hk', status: 'complete' }).length, 1);
  assert.deepEqual(filterVideos([{}], { status: 'updating' }), []);
});

test('long series range boundaries and cross-source progress remain consistent', () => {
  assert.deepEqual(episodeRanges(54), [{ start: 0, end: 30 }, { start: 30, end: 54 }]);
  assert.deepEqual(episodeRanges(60), [{ start: 0, end: 30 }, { start: 30, end: 60 }]);
  for (const [length, size] of [[0, 30], [-1, 30], [3.5, 30], [10, 0], [10, 1.5]]) assert.deepEqual(episodeRanges(length, size), []);
  const item = fixture();
  assert.equal(videoKey({ title: ' A B ' }), videoKey({ title: 'ab', year: '' }));
  const history = rememberProgress([{ ...item, source: 'ruyi', uid: 'ruyi:23' }], item, '第1集', 10, 20);
  assert.equal(history.length, 1); assert.equal(history[0].source, 'liangzi');
});

test('browse requests keep filters separate from movie search', async () => {
  await requestVideos('ruyi', { mode: 'browse', category: 'movie', type: 6, fetchImpl: async url => {
    const u = new URL(url, 'https://local.example');
    assert.equal(u.searchParams.get('type'), '6'); assert.equal(u.searchParams.get('category'), 'movie');
    assert.equal(u.searchParams.has('q'), false); return new Response('{"list":[]}');
  } });
  await requestVideos('ruyi', { mode: 'browse', fetchImpl: async () => new Response('{"list":[]}') });
});
