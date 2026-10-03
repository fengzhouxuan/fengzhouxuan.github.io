import test from 'node:test';
import assert from 'node:assert/strict';
import { sameFavorite, snapshotFavorite, favoriteSummary, acknowledgeFavorite, createWatchlistRefresher } from '../../source/video/watchlist.js';
import { loadSaved, saveItems } from '../../source/video/core.js';

const film = (count = 3, changes = {}) => ({ uid: 'ruyi:12', source: 'ruyi', id: '12', title: '追剧样本', year: '2026', category: '国产剧', remarks: '更新中', poster: 'https://example.com/poster.jpg', lines: [{ name: '线路', episodes: Array.from({ length: count }, (_, index) => ({ name: '第' + (index + 1) + '集', url: 'https://example.com/private-playlist.m3u8' })) }], ...changes });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('favorite snapshots store metadata and episode availability without retaining media URLs', () => {
  const item = snapshotFavorite(film(3, { title: '<b>追剧样本</b>', updateSchedule: '每周三更新', updatedAt: '2026-10-01', description: 'large description' }), null, 100);
  assert.equal(item.title, '追剧样本'); assert.equal(item.updatedAt, '2026-10-01');
  assert.deepEqual(item.tracking, { latest: 3, acknowledged: 3, count: 3, checkedAt: 100 });
  assert.equal(favoriteSummary(item).hasNew, false);
  assert.doesNotMatch(JSON.stringify(item), /private-playlist|description|lines/);
  assert.equal(snapshotFavorite(film(1, { poster: 'javascript:alert(1)' })).poster, '');
  for (const changes of [{ uid: 'ruyi:13' }, { source: 'unknown' }, { title: '' }]) assert.throws(() => snapshotFavorite(film(1, changes)), /不正确/);
  assert.throws(() => snapshotFavorite(film(), null, NaN), /不正确/);
});

test('new episode flags survive repeat refreshes until acknowledged or watched, without using timestamps', () => {
  const original = snapshotFavorite(film(3), null, 100);
  let updated = snapshotFavorite(film(5), original, 200);
  assert.equal(favoriteSummary(updated).hasNew, true);
  updated = snapshotFavorite(film(5, { updatedAt: 'newer timestamp' }), updated, 300);
  assert.equal(favoriteSummary(updated).hasNew, true);
  updated = acknowledgeFavorite(updated);
  assert.equal(favoriteSummary(updated).hasNew, false);
  assert.equal(favoriteSummary(snapshotFavorite(film(5, { updatedAt: 'another timestamp' }), updated)).hasNew, false);
  const six = snapshotFavorite(film(6), updated, 400);
  const history = [{ ...film(), episode: '第5集', position: 60, updatedAt: 1000 }, { ...film(), episode: '第6集', updatedAt: 500 }];
  const summary = favoriteSummary(six, history);
  assert.equal(summary.hasNew, true); assert.equal(summary.unwatched, true); assert.equal(summary.progress.episode, '第5集');
  assert.equal(favoriteSummary(six, [{ ...film(), episode: '第6集' }]).hasNew, false);
  assert.equal(favoriteSummary(six, [{ ...film(), episode: '特别篇' }]).hasNew, true);
  assert.equal(acknowledgeFavorite(six, [{ ...film(), episode: '第5集' }]), six);
  const watched = acknowledgeFavorite(six, [{ ...film(), episode: '第6集' }]);
  assert.equal(favoriteSummary(watched, [{ ...film(), episode: '第1集' }]).hasNew, false);
  assert.equal(acknowledgeFavorite(watched, [{ ...film(), episode: '第6集' }]), watched);
  assert.equal(acknowledgeFavorite({ ...six, tracking: null }, [] ).tracking, null);
  const reduced = snapshotFavorite(film(2), six);
  assert.equal(favoriteSummary(reduced).hasNew, false);
  assert.equal(favoriteSummary(reduced, [{ ...film(), episode: '第6集' }]).unwatched, false);
});

test('episode availability accepts regular names and ignores previews, dates, resolutions and movie labels', () => {
  const episodes = ['EP 01', '第02话', '003', '第4話', '第12集预告', '1080P', '2026-10-01', '特别篇', '第000集'].map(name => ({ name }));
  const item = snapshotFavorite(film(0, { category: '国漫', lines: [{ episodes }] }));
  assert.equal(item.tracking.latest, 4); assert.equal(favoriteSummary(item).availability, '可看至第 4 集');
  const unknown = snapshotFavorite(film(0, { lines: [{ episodes: [{ name: '特别篇' }] }] }));
  assert.equal(unknown.tracking.latest, null); assert.match(favoriteSummary(unknown).comparisonNote, /手动确认/);
  assert.equal(favoriteSummary(unknown).availability, '1 个播放条目');
  const movie = snapshotFavorite(film(2, { category: '动画片', isComplete: true }));
  assert.equal(movie.tracking.latest, null); assert.equal(favoriteSummary(movie).schedule.label, '已上线');
  const absent = snapshotFavorite(film(0, { lines: [], remarks: '' }));
  assert.equal(favoriteSummary(absent).availability, '尚未取得播放集数');
  assert.equal(snapshotFavorite(film(0, { lines: [{}] })).tracking.latest, null);
});

test('short dramas and AI dramas track numbered episodes while complete compilations stay single playback entries', () => {
  for (const category of ['短剧', 'AI漫剧']) {
    const original = snapshotFavorite(film(3, { category }), null, 100);
    assert.equal(original.tracking.latest, 3);
    const updated = snapshotFavorite(film(4, { category }), original, 200);
    assert.equal(favoriteSummary(updated).hasNew, true);
    const compilation = snapshotFavorite(film(0, { category, isComplete: true, lines: [{ episodes: [{ name: '全集' }] }] }));
    const summary = favoriteSummary(compilation);
    assert.equal(summary.hasNew, false); assert.equal(summary.availability, '整部合集');
    assert.equal(summary.schedule.label, '已完结');
    const single = snapshotFavorite(film(1, { category }));
    assert.equal(single.tracking.latest, null); assert.equal(favoriteSummary(single).availability, '单条视频');
    assert.match(favoriteSummary(single).comparisonNote, /未说明/);
    assert.equal(favoriteSummary({ ...single, playbackKind: 'invalid' }).availability, '1 个播放条目');
    assert.equal(favoriteSummary({ ...single, playbackKind: 'compilation', tracking: { ...single.tracking, count: 2 } }).availability, '2 个播放条目');
  }
});

test('older favorites establish their first baseline and missing catalog metadata can be filled safely', () => {
  const old = snapshotFavorite(film(0, { year: '', lines: undefined }));
  assert.equal(old.tracking, undefined); assert.equal(favoriteSummary(old).checkedAt, 0); assert.equal(favoriteSummary(old).availability, '更新中');
  assert.equal(acknowledgeFavorite(old), old);
  assert.equal(favoriteSummary({ ...old, remarks: '' }).availability, '尚未取得播放集数');
  const fresh = snapshotFavorite(film(10), old, 100);
  assert.equal(favoriteSummary(fresh).hasNew, false); assert.equal(fresh.year, '2026');
  const partial = snapshotFavorite(film(11, { year: '', category: '', poster: '' }), fresh);
  assert.equal(partial.year, '2026'); assert.equal(partial.category, '国产剧'); assert.equal(partial.poster, fresh.poster);
  assert.equal(favoriteSummary(partial).hasNew, true);
  const unavailable = snapshotFavorite(film(0));
  assert.equal(favoriteSummary(snapshotFavorite(film(10), unavailable)).hasNew, false);
  assert.equal(sameFavorite(old, film()), true);
  for (const changes of [{ uid: 'ruyi:13', id: '13' }, { title: '同一编号被另一部作品复用' }, { year: '2025' }]) assert.equal(sameFavorite(film(), film(3, changes)), false);
  const switched = snapshotFavorite(film(10, { uid: 'liangzi:12', source: 'liangzi' }), fresh);
  assert.equal(favoriteSummary(switched).hasNew, false);
});

test('corrupt saved tracking degrades safely and regular snapshots survive browser storage reloads', () => {
  const item = snapshotFavorite(film(3));
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  saveItems(storage, 'video-favorites', [snapshotFavorite(film(4), item)]);
  const restored = loadSaved(storage, 'video-favorites')[0]; assert.equal(favoriteSummary(restored).hasNew, true);
  for (const tracking of [null, { checkedAt: 'bad' }, { checkedAt: -1 }]) assert.equal(favoriteSummary({ ...item, tracking }).checkedAt, 0);
  const corrupt = { ...item, tracking: { checkedAt: 100, latest: 10000, count: -10, acknowledged: -1 } };
  assert.equal(favoriteSummary(corrupt).hasNew, false); assert.equal(acknowledgeFavorite(corrupt).tracking.count, 0);
  const legacy = { ...item, tracking: { checkedAt: 100, latest: 3, count: 3 } };
  assert.equal(favoriteSummary(legacy).hasNew, false);
  const history = [{ ...film(), source: 'liangzi', uid: 'liangzi:13', id: '13', episode: '第2集' }, { ...film(), year: '2025', episode: '第9集' }];
  assert.equal(favoriteSummary(item, history).unwatched, true);
});

test('watchlist summaries reuse attributed schedules and official title/year rules', () => {
  const override = [{ title: '追剧样本', year: '2026', schedule: '每周三09:00更新', validUntil: '2099-12-31', sourceName: '官方', sourceURL: 'https://example.com/schedule' }];
  const item = snapshotFavorite(film());
  assert.equal(favoriteSummary(item, [], override).schedule.credit, '官方');
  assert.equal(favoriteSummary(snapshotFavorite(film(3, { updateSchedule: '每周五更新' })), [], override).schedule.label, '每周五更新');
  assert.equal(favoriteSummary(snapshotFavorite(film(3, { isComplete: true })), [], override).schedule.label, '已完结');
});

test('watchlist refresh validates options, handles an empty list and deduplicates identities', async () => {
  assert.throws(() => createWatchlistRefresher(), /配置/);
  for (const concurrency of [0, 6, 1.5]) assert.throws(() => createWatchlistRefresher({ request: async () => {}, concurrency }), /配置/);
  const calls = []; const refresher = createWatchlistRefresher({ request: async (source, options) => { calls.push([source, options.id]); assert.ok(options.signal); return { videos: [film()] }; } });
  await refresher.refresh(); assert.equal(refresher.state.total, 0);
  await refresher.refresh([film(), film()]); assert.deepEqual(calls, [['ruyi', '12']]); assert.equal(refresher.state.completed, 1);
  assert.equal(refresher.state.loading, false);
});

test('refresh bounds parallel work, isolates failed or replaced titles and retries without discarding successes', async () => {
  const waiting = deferred(); let active = 0; let maximum = 0; let fail = true; const updates = []; const changes = [];
  const items = [film(), film(3, { uid: 'ruyi:13', id: '13' }), film(3, { uid: 'ruyi:14', id: '14' }), film(3, { uid: 'ruyi:15', id: '15' })];
  const refresher = createWatchlistRefresher({ concurrency: 2, request: async (source, { id }) => {
    active++; maximum = Math.max(maximum, active); await waiting.promise; active--;
    if (id === '13' && fail) throw new Error('private transport info');
    return { videos: [film(5, { id, uid: 'ruyi:' + id, title: id === '14' && fail ? '替代作品' : '追剧样本' })] };
  }, onUpdate: item => updates.push(item.id), onChange: () => changes.push(refresher.state.loading) });
  const pending = refresher.refresh(items); await refresher.refresh(items); assert.equal(maximum, 2);
  waiting.resolve(); await pending;
  assert.deepEqual(updates.sort(), ['12', '15']); assert.equal(refresher.state.failed.length, 2); assert.equal(refresher.state.completed, 4);
  assert.doesNotMatch(JSON.stringify(refresher.state), /private transport/); assert.equal(changes.at(-1), false);
  fail = false; await refresher.refresh(items); assert.equal(refresher.state.failed.length, 0); assert.equal(updates.length, 6); assert.equal(maximum, 2);
});

test('pause and restart discard late responses from canceled refreshes', async () => {
  const waiting = deferred(); const updates = []; let signal; let slow = true;
  const refresher = createWatchlistRefresher({ request: async (source, options) => {
    if (slow) { signal = options.signal; return waiting.promise; }
    return { videos: [film(6)] };
  }, onUpdate: item => updates.push(item.tracking || item.lines[0].episodes.length) });
  const pending = refresher.refresh([film()]); refresher.stop();
  assert.equal(signal.aborted, true); assert.equal(refresher.state.loading, false); assert.equal(refresher.state.stopped, true);
  slow = false; await refresher.refresh([film()]);
  waiting.resolve({ videos: [film(4)] }); await pending;
  assert.deepEqual(updates, [6]); assert.equal(refresher.state.completed, 1); assert.equal(refresher.state.stopped, false);
  const rejected = deferred(); const stopped = createWatchlistRefresher({ request: async () => { await rejected.promise; throw new Error('aborted'); } });
  const canceled = stopped.refresh([film()]); stopped.stop(); rejected.resolve(); await canceled;
  assert.equal(stopped.state.failed.length, 0);
});
