import test from 'node:test';
import assert from 'node:assert/strict';
import { episodeNumber } from '../../source/video/core.js';
import { matchingEpisode, matchingLine, resolvePlaybackSelection, createPlaybackFallback, createVariantDiscovery, createPlaybackIntent, resumePosition, screenPresentation, playbackSummary, createPlaybackMonitor } from '../../source/video/playback.js';

const episode = (name, url) => ({ name, url });
const film = (source = 'liangzi', changes = {}) => ({ uid: source + ':12', source, id: '12', title: '测试剧', year: '2026', category: '国产剧', lines: [{ name: '线路一', episodes: [episode('第01集', 'https://example.com/' + source + '-1.mp4'), episode('第02集', 'https://example.com/' + source + '-2.mp4')] }], ...changes });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('tab playback intent preserves only the selected film and episode pause state across reloads', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const intent = createPlaybackIntent(storage); const current = film();
  assert.equal(intent.paused(current, 0), false); assert.equal(intent.remember(current, 1, true), true);
  assert.equal(intent.paused(current, 0), false); assert.equal(intent.paused(film('ruyi'), 1), false);
  assert.equal(createPlaybackIntent(storage).paused(current, 1), true);
  assert.deepEqual(JSON.parse(values.get('video-playback-intent')), { source: 'liangzi', id: '12', episode: 1, paused: true });
  intent.remember(current, 1, false); assert.equal(createPlaybackIntent(storage).paused(current, 1), false);
  intent.remember(current, 1, true); intent.clear(); assert.equal(values.size, 0); assert.equal(intent.paused(current, 1), false);
});

test('invalid, oversized or private intent data cannot restore pause or replace a valid intent', () => {
  for (const text of [undefined, 'broken', '{}', 'x'.repeat(1025), JSON.stringify({ source: 'unknown', id: '12', episode: 1, paused: true }), JSON.stringify({ source: 'liangzi', id: '12', episode: -1, paused: true }), JSON.stringify({ source: 'liangzi', id: '12', episode: 1, paused: 'true' })]) assert.equal(createPlaybackIntent({ getItem: () => text }).paused(film(), 1), false);
  const intent = createPlaybackIntent(); intent.remember(film(), 1, true);
  for (const args of [[null, 1, true], [film('unknown'), 1, true], [film(), NaN, true], [film(), 10000, true], [film(), 1, 'true']]) assert.equal(intent.remember(...args), false);
  assert.equal(intent.paused(film(), 1), true); assert.equal(intent.paused(null, 1), false);
  const loaded = createPlaybackIntent({ getItem: () => JSON.stringify({ source: 'liangzi', id: '12', episode: 1, paused: true, url: 'private', title: 'private' }) });
  assert.equal(loaded.paused(film(), 1), true);
});

test('intent storage failures keep current-tab controls usable and clearing cannot resurrect paused state', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const intent = createPlaybackIntent(broken); assert.equal(intent.remember(film('zip0', { id: 'liangzi:12' }), 0, true), true);
  assert.equal(intent.paused(film('zip0', { id: 'liangzi:12' }), 0), true);
  intent.clear(); assert.equal(intent.paused(film('zip0', { id: 'liangzi:12' }), 0), false);
});

test('pause intent follows episode identity when line order changes and upgrades legacy stored indices safely', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const intent = createPlaybackIntent(storage); const current = film();
  assert.equal(intent.remember(current, 1, true, '第03集'), true);
  const loaded = createPlaybackIntent(storage);
  assert.equal(loaded.paused(current, 2, '第3集'), true); assert.equal(loaded.paused(current, 1, '第2集'), false);
  assert.equal(loaded.episodeName(current, 1), '第03集'); assert.equal(loaded.episodeName(film('ruyi'), 1), '');
  assert.equal(loaded.episodeName(current, 2), ''); assert.equal(intent.remember(current, 1, true, 'x'.repeat(121)), false);
  for (const episodeName of [null, '', '<b>第3集</b>', 'x'.repeat(121)]) {
    const invalid = createPlaybackIntent({ getItem: () => JSON.stringify({ source: current.source, id: current.id, episode: 1, paused: true, episodeName }) });
    assert.equal(invalid.paused(current, 1, '第3集'), false);
  }
  const legacy = createPlaybackIntent({ getItem: () => JSON.stringify({ source: current.source, id: current.id, episode: 1, paused: true }) });
  assert.equal(legacy.paused(current, 1, '第2集'), true); assert.equal(legacy.episodeName(current, 1), '');
});

test('resume selection finds the actual saved episode on every line and never borrows a position for a missing episode', () => {
  const current = film(); const saved = { episode: '第03集', position: 60 };
  assert.deepEqual(resolvePlaybackSelection(current, { saved }), { line: -1, episode: -1, name: '第03集', position: 60, missing: true });
  const alternative = { ...current, lines: [...current.lines, { name: '备用', episodes: [episode('第01集', 'https://example.com/a.mp4'), episode('第3集', 'https://example.com/3.mp4')] }] };
  for (const automatic of [true, false]) assert.deepEqual(resolvePlaybackSelection(alternative, { saved, automatic }), { line: 1, episode: 1, name: '第3集', position: 60, missing: false });
  assert.deepEqual(resolvePlaybackSelection(alternative, { episode: 1, episodeName: '第3集', saved }), { line: 1, episode: 1, name: '第3集', position: 60, missing: false });
  assert.equal(resolvePlaybackSelection(current, { episode: 0, saved }).position, 0);
  assert.equal(resolvePlaybackSelection(current, { episode: 9, saved }).name, '第10集');
  assert.equal(resolvePlaybackSelection(current, { episode: 9, saved }).position, 0);
  assert.equal(resolvePlaybackSelection(current, { saved: { episode: '预告01', position: 60 } }).missing, true);
});

test('playback selection respects manual episodes, overrides, movies and empty directories while bounding saved positions', () => {
  const current = film();
  assert.deepEqual(resolvePlaybackSelection(current), { line: 0, episode: 0, name: '第01集', position: 0, missing: false });
  assert.equal(resolvePlaybackSelection(current, { episodeName: '第2集', saved: { episode: '第1集', position: 60 } }).position, 0);
  assert.equal(resolvePlaybackSelection(current, { episodeName: '第1集', override: { episode: '第2集', position: 45 } }).position, 45);
  for (const position of [NaN, Infinity, undefined, -20]) assert.equal(resolvePlaybackSelection(current, { saved: { episode: '第1集', position } }).position, 0);
  const movie = film('liangzi', { category: '剧情片', lines: [{ episodes: [episode('HD', 'https://example.com/movie.mp4')] }] });
  assert.equal(resolvePlaybackSelection(movie, { saved: { episode: '正片', position: 60 } }).position, 60);
  assert.equal(resolvePlaybackSelection(movie, { episodeName: 'HD' }).name, 'HD');
  assert.equal(resolvePlaybackSelection(film('liangzi', { lines: [] }), { saved: { episode: '第2集', position: 60 } }).position, 60);
  assert.equal(resolvePlaybackSelection({}).missing, true);
  assert.equal(resolvePlaybackSelection(undefined).missing, true);
  const repeated = { ...current, lines: [...current.lines, { name: '优先', episodes: current.lines[0].episodes }] };
  assert.equal(resolvePlaybackSelection(repeated, { priority: (_item, line) => -line }).line, 1);
  assert.equal(resolvePlaybackSelection(repeated, { automatic: false, priority: (_item, line) => -line }).line, 0);
});

test('available alternatives never consume the fallback budget, and duplicate media are not alternatives', () => {
  const main = film(); const fallback = createPlaybackFallback();
  assert.equal(fallback.available(null), false); assert.equal(fallback.available(main), false);
  fallback.begin(main, 0, 0, 20);
  const duplicate = { ...main, lines: [...main.lines, { name: '重复', episodes: main.lines[0].episodes }] };
  assert.equal(fallback.available(duplicate), false);
  for (let i = 0; i < 20; i++) assert.equal(fallback.available(main, [film('ruyi')]), true);
  assert.equal(fallback.state.attempts, 0); assert.equal(fallback.state.position, 20);
  assert.equal(fallback.next(main, [film('ruyi')]).item.source, 'ruyi');
  assert.equal(fallback.available(main, [film('ruyi')]), false);
  assert.equal(fallback.available(main, [film('feifan', { year: '2025' })]), false);
  fallback.stop(); assert.equal(fallback.available(main, [film('feifan')]), false);
});

test('startup budget can shorten when a matching alternative arrives without resetting elapsed time', () => {
  let time = 0; const monitor = createPlaybackMonitor({ now: () => time }); monitor.begin({ startupTimeout: 15000 });
  time = 7000; assert.equal(monitor.check({ startupTimeout: 8000 }).action, '');
  assert.equal(monitor.state.waitMs, 7000);
  time = 8000; assert.equal(monitor.check({ startupTimeout: 8000 }).action, 'fail');
  monitor.begin({ startupTimeout: 15000 }); time += 9000;
  for (const startupTimeout of [0, -1, NaN, Infinity]) assert.equal(monitor.check({ startupTimeout }).action, '');
  time += 6000; assert.equal(monitor.check().action, 'fail');
  monitor.begin(); time += 10000;
  assert.equal(monitor.check({ hidden: true, startupTimeout: 6000 }).waitMs, 0);
  time += 60000; assert.equal(monitor.check({ hidden: false, startupTimeout: 6000 }).action, '');
  time += 6000; assert.equal(monitor.check({ startupTimeout: 6000 }).action, 'fail');
});

test('resume waiting retains the intended position and ignores opening frames until the seek finishes', () => {
  let time = 0; const monitor = createPlaybackMonitor({ now: () => time }); monitor.begin({ position: 34, startupTimeout: 8000 });
  time = 1000; let result = monitor.check({ position: 0.2, ready: 4, paused: false, playing: true, resumePending: true });
  assert.equal(result.started, false); assert.equal(result.phase, 'loading'); assert.equal(result.position, 34);
  time = 2000; result = monitor.check({ position: 1, ready: 4, paused: false, resumePending: true });
  assert.equal(result.started, false); assert.equal(result.position, 34);
  time = 2500; result = monitor.check({ position: 34, ready: 4, paused: false, resumePending: false, playing: true });
  assert.equal(result.started, true); assert.equal(result.phase, 'playing'); assert.equal(result.position, 34);
  monitor.begin({ position: 60, startupTimeout: 8000 }); time += 8000;
  result = monitor.check({ position: 0.5, ready: 4, paused: false, playing: true, resumePending: true });
  assert.equal(result.action, 'fail'); assert.equal(result.position, 60);
});

test('source discovery publishes fast matches before slow neighbours and retains exact identities', async () => {
  const jobs = []; let updates = 0;
  const discovery = createVariantDiscovery({ sources: [{ id: 'liangzi' }, { id: 'ruyi' }, { id: 'feifan' }], request: (source, options) => new Promise((resolve, reject) => jobs.push({ source, options, resolve, reject })), onChange: () => updates++ });
  const current = film(); const group = { ...current, variants: [current] };
  const pending = discovery.open(group); assert.equal(jobs.length, 2); assert.equal(discovery.state.loading, true);
  assert.equal(jobs[0].options.query, current.title);
  jobs[0].resolve({ videos: [film('ruyi'), film('ruyi', { year: '2025' }), film('ruyi', { title: '续作' }), null] }); await tick();
  assert.deepEqual(group.variants.map(item => item.source), ['liangzi', 'ruyi']);
  assert.equal(group.variants[0], current); assert.equal(discovery.state.loading, true); assert.equal(discovery.state.completed, 1);
  jobs[1].reject(new Error('private network failure')); await pending;
  assert.equal(discovery.state.loading, false); assert.deepEqual(discovery.state.failed, ['feifan']); assert.equal(updates, 3);
});

test('switching films cancels discovery and late success or failure cannot mutate the new film', async () => {
  const jobs = []; let updates = 0;
  const discovery = createVariantDiscovery({ sources: [{ id: 'ruyi' }, { id: 'feifan' }], request: (source, options) => new Promise((resolve, reject) => jobs.push({ options, resolve, reject })), onChange: () => updates++ });
  const first = { ...film(), variants: [film()] }; const second = { ...film(), title: '另一部剧', variants: [film('liangzi', { title: '另一部剧' })] };
  const old = discovery.open(first); const fresh = discovery.open(second);
  assert.equal(jobs[0].options.signal.aborted, true); assert.equal(jobs[2].options.signal.aborted, false);
  jobs[0].resolve({ videos: [film('ruyi')] }); jobs[1].reject(new Error('late failure')); await old;
  assert.equal(first.variants.length, 1); assert.equal(discovery.state.group, second); assert.equal(discovery.state.completed, 0); assert.equal(updates, 2);
  discovery.stop(); assert.equal(jobs[2].options.signal.aborted, true); assert.equal(discovery.state.loading, false);
  jobs[2].resolve({ videos: [film('ruyi', { title: '另一部剧' })] }); jobs[3].reject(new Error('cancelled')); await fresh;
  assert.equal(second.variants.length, 1); assert.equal(discovery.state.completed, 0); assert.equal(updates, 2);
});

test('source discovery handles empty, malformed and unavailable results without hiding existing sources', async () => {
  for (const options of [undefined, {}, { request: 1 }, { request() {}, onChange: null }, { request() {}, sources: null }, { request() {}, sources: [{ id: 'unknown' }] }]) assert.throws(() => createVariantDiscovery(options), /配置/);
  const discovery = createVariantDiscovery({ request: async source => source === 'ruyi' ? { videos: [] } : null, sources: [{ id: 'liangzi' }, { id: 'ruyi' }, { id: 'feifan' }, { id: 'auete', search: false }] });
  for (const group of [null, {}, { title: '', variants: [] }]) await assert.rejects(discovery.open(group), /信息/);
  const current = film(); const group = { ...current, variants: [current] }; await discovery.open(group);
  assert.equal(discovery.state.total, 2); assert.equal(discovery.state.completed, 2); assert.deepEqual(discovery.state.failed, ['feifan']); assert.deepEqual(group.variants, [current]);
  const empty = createVariantDiscovery({ request: async () => { throw new Error('must not query'); }, sources: [] }); await empty.open(group);
  assert.equal(empty.state.loading, false); assert.equal(empty.state.total, 0); empty.stop();
});

function monitorFixture() {
  let time = 0;
  const monitor = createPlaybackMonitor({ now: () => time });
  const sample = { position: 30, ready: 4, paused: false, automatic: true };
  monitor.begin({ position: 30 }); monitor.check({ ...sample, playing: true });
  return { monitor, sample, advance(ms, changes = {}) { time += ms; Object.assign(sample, changes); return monitor.check(sample); } };
}

test('monitor validates timings and slow startup can complete without premature failure', () => {
  for (const settings of [{ now: null }, { startupAfter: 0 }, { stallAfter: Infinity }, { noticeAfter: -1 }, { seekAfter: NaN }, { noticeAfter: 12000 }]) assert.throws(() => createPlaybackMonitor(settings), /参数/);
  const defaults = createPlaybackMonitor(); defaults.begin(); assert.equal(defaults.check().phase, 'loading'); defaults.stop();
  let time = 0; const monitor = createPlaybackMonitor({ now: () => time });
  assert.equal(monitor.check().phase, 'idle'); monitor.fail(); monitor.begin({ position: NaN });
  assert.equal(monitor.state.position, 0);
  time = 19000; assert.equal(monitor.check({ paused: true, ready: 1 }).action, '');
  assert.equal(monitor.check({ position: 0.1, paused: false, ready: 4, playing: true }).phase, 'playing');
  monitor.begin({ position: 42 }); time += 20000;
  const timeout = monitor.check({ position: 0, ready: 4, paused: false });
  assert.equal(timeout.action, 'fail'); assert.equal(timeout.position, 42); assert.match(timeout.reason, /起播超时/);
  assert.equal(monitor.check().action, ''); monitor.stop(); assert.equal(monitor.check().phase, 'idle');
});

test('brief buffering and repeated stalled events do not defeat real progress or reset the long stall deadline', () => {
  const f = monitorFixture();
  assert.equal(f.advance(1000).phase, 'playing'); assert.equal(f.advance(500).phase, 'buffering');
  assert.equal(f.advance(1000, { position: 31 }).phase, 'playing');
  for (let i = 0; i < 10; i++) assert.equal(f.advance(1000).action, '');
  const recovery = f.advance(2000);
  assert.equal(recovery.action, 'recover'); assert.equal(recovery.position, 31);
  assert.equal(f.advance(20000).action, '');
  f.monitor.begin({ position: recovery.position, recovered: true });
  assert.equal(f.advance(20000, { position: 0, ready: 1 }).action, 'fail');
});

test('per-attempt startup budgets are validated and reset without changing pause protections', () => {
  let time = 0; const monitor = createPlaybackMonitor({ now: () => time });
  for (const startupTimeout of [0, -1, Infinity, NaN]) assert.throws(() => monitor.begin({ startupTimeout }), /等待时间/);
  monitor.begin({ startupTimeout: 8000 }); time = 7999; assert.equal(monitor.check().action, ''); time++; assert.equal(monitor.check().action, 'fail');
  monitor.begin(); time += 8000; assert.equal(monitor.check().action, ''); time += 12000; assert.equal(monitor.check().action, 'fail');
  monitor.begin({ startupTimeout: 8000 }); time += 60000; assert.equal(monitor.check({ blocked: true }).phase, 'blocked');
  time++; assert.equal(monitor.check({ blocked: false }).action, '');
});

test('fallback ranking selects recent better matching lines and sources while preserving budget and exclusions', () => {
  assert.throws(() => createPlaybackFallback({ priority: null }), /优选/);
  const primary = film('liangzi', { lines: [...film().lines, { name: 'slow', episodes: [episode('第02集', 'https://example.com/slow.mp4')] }, { name: 'fast', episodes: [episode('第02集', 'https://example.com/fast.mp4')] }] });
  const priority = (item, line) => line === undefined ? item.source === 'feifan' ? 1 : 10 : line === 2 ? 1 : 10;
  const plan = createPlaybackFallback({ priority }); plan.begin(primary, 0, 1, 42);
  assert.equal(plan.next(primary).line, 2); assert.equal(plan.next(primary).line, 1);
  assert.equal(plan.next(primary, [film('ruyi'), film('feifan')]).item.source, 'feifan'); assert.equal(plan.state.attempts, 3);
  assert.equal(plan.next(primary, [film('ruyi')]), null); assert.equal(plan.state.position, 42);
  plan.begin(primary, 0, 1); assert.equal(plan.lineFor(primary).line, 2);
  assert.equal(matchingLine(primary, '第02集', false, new Set(['https://example.com/fast.mp4']), priority).line, 0);
  assert.equal(matchingLine(primary, '第02集', false, new Set(), () => NaN).line, 0);
});

test('only one local reload is allowed per media attempt, including later stalls after successful recovery', () => {
  const f = monitorFixture(); assert.equal(f.advance(12000).action, 'recover');
  f.monitor.begin({ position: 30, recovered: true });
  f.monitor.check({ ...f.sample, playing: true });
  assert.equal(f.advance(12000).action, 'fail');
  f.monitor.begin({ position: 30 }); f.monitor.check({ ...f.sample, playing: true });
  assert.equal(f.advance(12000, { automatic: false }).action, 'fail');
});

test('pause, autoplay blocking, backgrounding and ended media cannot trigger recovery', () => {
  for (const [changes, phase] of [[{ userPaused: true }, 'paused'], [{ paused: true }, 'paused'], [{ blocked: true }, 'blocked'], [{ hidden: true }, 'background']]) {
    const f = monitorFixture(); assert.equal(f.advance(60000, changes).phase, phase);
    assert.equal(f.advance(60000).action, '');
    assert.equal(f.advance(1, { userPaused: false, paused: false, blocked: false, hidden: false }).action, '');
    assert.equal(f.advance(11999).action, ''); assert.equal(f.advance(1).action, 'recover');
  }
  const f = monitorFixture(); assert.equal(f.advance(60000, { ended: true, paused: true }).phase, 'ended'); assert.equal(f.advance(60000).action, '');
});

test('long seeks offer manual retry and only start a fresh buffering deadline after seeking settles', () => {
  const f = monitorFixture(); assert.equal(f.advance(1000, { seeking: true, position: 300 }).phase, 'seeking');
  assert.equal(f.advance(60000).phase, 'seek-timeout'); assert.equal(f.advance(60000).action, '');
  assert.equal(f.advance(1, { seeking: false }).action, '');
  assert.equal(f.advance(12000).action, 'recover');
  f.monitor.begin({ position: 300, recovered: true });
  assert.equal(f.advance(19000, { position: 300, resumeSeeking: true, ready: 1 }).action, '');
  assert.equal(f.advance(1000).action, 'fail');
});

test('offline failures wait and reconnect reloads the same attempt once, without exhausting source budgets', () => {
  const f = monitorFixture(); f.monitor.fail('分片读取失败');
  assert.equal(f.advance(60000, { offline: true, ready: 1, error: true }).phase, 'offline');
  assert.equal(f.advance(60000).action, '');
  const reconnect = f.advance(1, { offline: false });
  assert.equal(reconnect.action, 'recover'); assert.equal(reconnect.position, 30); assert.match(reconnect.reason, /网络已恢复/);
  assert.equal(f.advance(60000).action, '');
  const buffered = monitorFixture(); assert.equal(buffered.advance(60000, { offline: true, position: 31 }).phase, 'offline');
  assert.equal(buffered.advance(1, { offline: false, position: 32 }).action, '');
  const manual = monitorFixture(); manual.advance(1, { offline: true, ready: 1 });
  assert.equal(manual.advance(1, { offline: false, automatic: false }).action, 'fail');
  const blocked = monitorFixture(); assert.equal(blocked.advance(1, { offline: true, blocked: true }).phase, 'offline');
  assert.equal(blocked.advance(60000, { offline: false }).phase, 'blocked'); assert.equal(blocked.advance(60000).action, '');
  blocked.monitor.fail('线路无法加载'); assert.equal(blocked.advance(1).reason, '线路无法加载'); assert.equal(blocked.advance(60000).action, '');
});

test('offline reconnect and hard errors defer while paused, seeking or hidden; stale stopped monitors remain inert', () => {
  for (const changes of [{ userPaused: true }, { seeking: true }, { hidden: true }]) {
    const f = monitorFixture(); f.monitor.fail(); f.advance(1, { offline: true, ready: 1, error: true });
    assert.equal(f.advance(60000, { offline: false, ...changes }).action, '');
    assert.equal(f.advance(1, { userPaused: false, seeking: false, hidden: false }).action, 'recover');
  }
  const f = monitorFixture(); f.monitor.fail('<b>线路失败</b>');
  assert.equal(f.advance(1).reason, '线路失败'); assert.equal(f.advance(1).action, '');
  f.monitor.stop(); f.monitor.fail('迟到错误'); assert.equal(f.advance(60000).action, '');
  f.monitor.begin({ position: 20 }); assert.equal(f.advance(1, { position: NaN, paused: true }).action, '');
  assert.equal(f.monitor.state.position, 20);
});

test('local stall reloads preserve the existing per-episode fallback budget and cancellation identity', () => {
  const primary = film('liangzi', { lines: [film().lines[0], { name: '备用', episodes: [episode('第02集', 'https://example.com/backup.mp4')] }] });
  const plan = createPlaybackFallback(); plan.begin(primary, 0, 1, 30);
  const f = monitorFixture(); const reload = f.advance(12000);
  plan.remember(reload.position); assert.equal(plan.state.attempts, 0); assert.equal(plan.state.episode, '第02集');
  f.monitor.begin({ position: reload.position, recovered: true });
  assert.equal(f.advance(20000, { position: 0 }).action, 'fail');
  const line = plan.next(primary); assert.equal(line.line, 1); assert.equal(line.episode, 0); assert.equal(plan.state.position, 30); assert.equal(plan.state.attempts, 1);
  plan.stop(); f.monitor.stop(); assert.equal(plan.next(primary), null); assert.equal(f.advance(60000).action, '');
});

test('screen presentation follows real dimensions, keeps explicit modes and degrades before metadata', () => {
  assert.deepEqual(screenPresentation(720, 1254), { portrait: true, ratio: 720 / 1254 });
  assert.deepEqual(screenPresentation(1920, 1080), { portrait: false, ratio: 16 / 9 });
  assert.deepEqual(screenPresentation(720, 1254, 'wide'), { portrait: false, ratio: 16 / 9 });
  assert.deepEqual(screenPresentation(1920, 1080, 'portrait'), { portrait: true, ratio: 9 / 16 });
  assert.equal(screenPresentation(720, 1254, 'invalid').portrait, true);
  assert.equal(screenPresentation(720, 720).portrait, false);
  for (const [width, height] of [[0, 0], [-1, 10], [NaN, 10], [10, Infinity], ['720', 1254]]) {
    assert.deepEqual(screenPresentation(width, height), { portrait: false, ratio: 16 / 9 });
    assert.deepEqual(screenPresentation(width, height, 'portrait'), { portrait: true, ratio: 9 / 16 });
  }
});

test('one short video is not assumed to be a complete compilation or a numbered episode', () => {
  const item = film('liangzi', { category: 'AI漫剧', lines: [{ episodes: [episode('第01集')] }] });
  for (const remarks of ['', '已完结', '全80集']) {
    const summary = playbackSummary({ ...item, remarks });
    assert.equal(summary.kind, 'single'); assert.equal(summary.label, '单条视频'); assert.match(summary.note, /未说明/);
    assert.deepEqual(summary.names, ['单条视频']); assert.equal(item.lines[0].episodes[0].name, '第01集');
  }
  for (const name of ['全集', '全剧集', '完整版', '合集']) {
    const summary = playbackSummary({ ...item, lines: [{ episodes: [episode(name)] }] });
    assert.equal(summary.kind, 'compilation'); assert.equal(summary.label, '整部合集'); assert.match(summary.note, /合并/);
  }
  assert.equal(playbackSummary({ ...item, remarks: '全集' }).kind, 'compilation');
  for (const name of ['全集预告', '完整版试看', '花絮合集', '全集片段']) assert.equal(playbackSummary({ ...item, lines: [{ episodes: [episode(name)] }] }).kind, 'single');
  assert.equal(playbackSummary({ ...item, category: '国产剧' }).label, '1 集');
  const movie = playbackSummary({ ...item, category: '剧情片', remarks: '完整版' });
  assert.equal(movie.label, '单部影片'); assert.equal(movie.note, ''); assert.equal(movie.kind, 'single');
  assert.equal(playbackSummary(film('liangzi', { category: '短剧', remarks: '全集' })).kind, 'episodes');
  assert.deepEqual(playbackSummary(film()).names, ['第01集', '第02集']);
  assert.equal(playbackSummary(film(), 1).count, 0);
  assert.deepEqual(playbackSummary(null), { kind: 'episodes', count: 0, label: '0 集', note: '', names: [] });
});

test('automatic resume preserves positions near the end while saved completed episodes keep their restart behavior', () => {
  assert.equal(resumePosition(90, 120, true), 90); assert.equal(resumePosition(115, 120, true), 115);
  assert.equal(resumePosition(90, 60, true), 59); assert.equal(resumePosition(115, 120), 0);
  assert.equal(resumePosition(90, 120), 90); assert.equal(resumePosition(1, 0.5, true), 0);
  for (const [position, duration] of [[-1, 120], [0, 120], [10, 0], [NaN, 100], [10, Infinity]]) assert.equal(resumePosition(position, duration, true), 0);
});

test('automatic episode matching keeps exact specials and regular numbers, never substitutes a nearby episode', () => {
  for (const name of ['第002集', 'EP 2', '02', '第2話']) assert.equal(episodeNumber(name), 2);
  for (const name of ['第2集上', '第2集预告', '第0集', '2026-10-01', '1080P', '特别篇', undefined]) assert.equal(episodeNumber(name), null);
  const episodes = [episode('第01集'), episode('02'), episode('特别篇')];
  assert.equal(matchingEpisode(episodes, '第02集'), 1); assert.equal(matchingEpisode(episodes, '特别篇'), 2);
  assert.equal(matchingEpisode(episodes, '第3集'), -1); assert.equal(matchingEpisode(episodes, '第2集上'), -1);
  assert.equal(matchingEpisode([], '第1集'), -1);
  assert.equal(matchingEpisode([episode('HD国语')], 'HD中字', true), 0);
  assert.equal(matchingEpisode([episode('HD国语')], '第1集', true), 0);
  assert.equal(matchingEpisode([episode('HD国语'), episode('HD中字')], '蓝光', true), -1);
  assert.equal(matchingLine({ lines: [film().lines[0], { episodes: [episode('第3集')] }] }, '第3集').line, 1);
  assert.equal(matchingLine({}, '第3集'), null);
});

test('fallback prioritizes other same-source lines, then exact known-title/year identities', () => {
  const primary = film('liangzi', { lines: [film().lines[0], { name: '线路二', episodes: [episode('02', 'https://example.com/alternate.mp4')] }] });
  const plan = createPlaybackFallback(); plan.begin(primary, 0, 1, 90);
  const same = plan.next(primary, [film('ruyi')]);
  assert.equal(same.type, 'line'); assert.equal(same.line, 1); assert.equal(same.episode, 0); assert.equal(plan.state.position, 90);
  const source = plan.next(primary, [film('ruyi', { year: '2025' }), film('feifan', { title: '其他剧' }), film('ruyi')]);
  assert.equal(source.type, 'source'); assert.equal(source.item.source, 'ruyi'); assert.equal(plan.state.attempts, 2);
  const target = plan.lineFor(source.item); assert.deepEqual(target, { line: 0, episode: 1 }); plan.mark(source.item, 0, 1);
  assert.equal(plan.next(source.item, [primary, source.item]), null);
});

test('duplicate media addresses and exhausted sources are skipped without cycling', () => {
  const primary = film('liangzi', { lines: [film().lines[0], { episodes: [episode('第02集', film().lines[0].episodes[1].url)] }, { episodes: [episode('第3集', 'https://example.com/3.mp4')] }] });
  const plan = createPlaybackFallback(); plan.begin(primary, 0, 1);
  const duplicate = film('ruyi', { lines: [{ episodes: [episode('第2集', film().lines[0].episodes[1].url)] }] });
  assert.equal(plan.next(primary, [duplicate]).type, 'source'); assert.equal(plan.lineFor(duplicate), null);
  assert.equal(plan.next(primary, [primary, duplicate]), null); assert.equal(plan.state.attempts, 1);
  assert.equal(plan.lineFor(film('ruyi', { title: '另一部剧' })), null);
});

test('each episode has a finite fallback budget even if a selected source later fails', () => {
  for (const maximum of [0, 6, 1.5]) assert.throws(() => createPlaybackFallback({ maximum }), /次数/);
  const primary = film(); const variants = ['ruyi', 'feifan', 'pianku', 'zip0'].map(source => film(source, source === 'zip0' ? { id: 'ruyi:12', uid: 'zip0:ruyi:12' } : {}));
  const plan = createPlaybackFallback(); plan.begin(primary, 0, 1);
  for (let i = 0; i < 3; i++) assert.equal(plan.next(primary, variants).type, 'source');
  assert.equal(plan.next(primary, variants), null); assert.equal(plan.state.attempts, 3);
  plan.begin(primary, 0, 0); assert.equal(plan.state.attempts, 0); assert.equal(plan.state.episode, '第01集');
  assert.ok(plan.next(primary, variants));
});

test('manual cancellation, new films and new episodes invalidate old fallback generations', () => {
  const plan = createPlaybackFallback(); assert.equal(plan.next(film(), [film('ruyi')]), null);
  plan.begin(film(), 0, 1, 42); const previous = plan.state.epoch;
  plan.stop(); assert.ok(plan.state.epoch > previous); assert.equal(plan.next(film(), [film('ruyi')]), null);
  plan.begin(film('ruyi'), 0, 0); assert.equal(plan.state.stopped, false); assert.equal(plan.state.position, 0);
  assert.equal(plan.next(film('feifan', { title: '其他剧' }), [film()]), null);
  for (const position of [-1, NaN, Infinity, '30']) { plan.remember(position); assert.equal(plan.state.position, 0); }
  plan.remember(30); plan.remember(5); assert.equal(plan.state.position, 5); plan.remember(0); assert.equal(plan.state.position, 0);
});

test('unknown years, invalid source identities and absent matching episodes cannot be automatic destinations', () => {
  const primary = film('liangzi', { year: '' }); const plan = createPlaybackFallback();
  plan.begin(primary, 0, 1); assert.equal(plan.next(primary, [film('ruyi', { year: '' })]), null);
  plan.begin(film(), 0, 1); assert.equal(plan.next(film(), [film('unknown')]), null);
  const incomplete = film('ruyi', { lines: [{ episodes: [episode('第01集', 'https://example.com/1.mp4')] }] });
  assert.equal(plan.next(film(), [incomplete]).type, 'source'); assert.equal(plan.lineFor(incomplete), null);
  plan.begin(film('liangzi', { lines: undefined }), 0, 2, 10, '第3集');
  assert.equal(plan.state.episode, '第3集'); assert.equal(plan.lineFor({ ...incomplete, lines: undefined }), null);
});
