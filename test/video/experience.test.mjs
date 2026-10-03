import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackExperience, playbackLineKey } from '../../source/video/experience.js';

const item = (source = 'liangzi', names = ['主线路', '备用线']) => ({ source, category: '国产剧', lines: names.map(name => ({ name, episodes: [{ name: '第01集' }, { name: '第02集' }] })) });
function fixture(options = {}) {
  let time = 0; let wall = 1000000; const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const quality = createPlaybackExperience({ storage, now: () => time, wallNow: () => wall, ...options });
  return { quality, saved, storage, tick(ms, phase, sample) { time += ms; return quality.observe(phase, sample); }, age(ms) { wall += ms; }, records() { return JSON.parse(saved.get('video-playback-experience') || '[]'); } };
}
function success(f, video, line, startup = 1000, watch = 12000) {
  f.quality.begin(video, line); f.tick(startup); assert.equal(f.quality.frame(), true); f.tick(watch); f.quality.finish();
}

test('line identities keep source boundaries and never retain media addresses', () => {
  assert.equal(playbackLineKey(item(), 0), 'liangzi|主线路');
  assert.equal(playbackLineKey(item('ruyi', ['<b>主线路</b>']), 0), 'ruyi|主线路');
  for (const video of [item('unknown'), item('liangzi', ['https://example.com/private.m3u8?secret=1']), item('liangzi', ['bad|name']), null]) assert.equal(playbackLineKey(video, 0), '');
  assert.equal(playbackLineKey(item(), 10), '');
});

test('experience validates dependencies and default clocks work without browser storage', () => {
  for (const options of [{ now: null }, { wallNow: false }, { maximum: 0 }, { maximum: 201 }, { maximum: 1.5 }, { lifetime: Infinity }, { lifetime: 0 }]) assert.throws(() => createPlaybackExperience(options), /配置/);
  const quality = createPlaybackExperience(); assert.equal(quality.frame(), false); quality.fail(); quality.open();
  assert.equal(quality.frame(), false); quality.begin(item(), 0); assert.equal(quality.frame('unsupported'), false); assert.equal(quality.frame('playing'), true);
  quality.finish(); quality.clear(); assert.equal(quality.state.active, false);
});

test('initial lookup and actual frame timing are separated from per-line startup, with no duplicate successes', () => {
  const f = fixture(); f.quality.open(); f.tick(1000); f.quality.begin(item(), 0, true); f.tick(2000);
  assert.equal(f.quality.frame(), true); assert.equal(f.quality.frame(), false);
  assert.equal(f.quality.state.firstFrameMs, 3000); assert.equal(f.quality.state.evidence, 'frame');
  assert.equal(f.quality.profile(item(), 0).frameMs, 2000);
  f.tick(5000); f.quality.checkpoint(); assert.equal(f.records()[0].samples[0].watchMs, 5000);
  f.quality.finish(); assert.equal(f.quality.state.watchMs, 5000);
  assert.equal(f.records()[0].samples.length, 1); assert.equal(f.records()[0].samples[0].watchMs, 5000);
});

test('pause, autoplay blocking, offline, background and seeks do not inflate startup or penalize a source', () => {
  for (const phase of ['paused', 'blocked', 'offline', 'background', 'seeking', 'seek-timeout']) {
    const f = fixture(); f.quality.begin(item(), 0); f.tick(500, phase);
    f.tick(60000); assert.equal(f.quality.frame(), false); f.quality.fail();
    assert.equal(f.quality.profile(item(), 0).samples, 0);
    f.tick(0, 'loading'); f.tick(500); assert.equal(f.quality.frame(), true);
    assert.equal(f.quality.state.firstFrameMs, 1000);
  }
});

test('qualified buffer intervals count once, exclude user waits and survive actual recovery', () => {
  const f = fixture(); f.quality.begin(item(), 0); f.tick(1000); f.quality.frame(); f.tick(10000, 'buffering');
  f.tick(2000, 'buffering'); assert.equal(f.quality.state.buffers, 1); f.tick(1000, 'paused'); f.tick(60000, 'playing');
  f.tick(2000); f.quality.finish();
  assert.equal(f.quality.state.watchMs, 12000); assert.equal(f.quality.state.bufferMs, 3000);
  assert.equal(f.quality.profile(item(), 0).label, '近期缓冲较多');
});

test('foreground watch time follows actual media progress, excluding brief stalls and seek jumps at any speed', () => {
  const f = fixture(); f.quality.begin(item(), 0); f.tick(1000, 'loading', { position: 0 }); f.quality.frame();
  f.tick(1000, 'playing', { position: 1 }); f.tick(1000, 'playing', { position: 1 });
  assert.equal(f.quality.state.watchMs, 1000);
  f.tick(1000, 'playing', { position: 3, rate: 2 }); f.tick(1000, 'playing', { position: 13, seeking: true });
  f.tick(1000, 'playing', { position: 14, rate: 0 }); f.tick(1000, 'playing', { position: 0 });
  f.quality.checkpoint(); assert.equal(f.quality.state.watchMs, 3000);
  f.quality.begin(item(), 1); f.tick(1000, 'loading', { position: -1 }); f.quality.frame(); f.tick(1000, 'playing', { position: 20 });
  assert.equal(f.quality.state.watchMs, 0); f.tick(1000, 'playing', { position: 21 });
  assert.equal(f.quality.state.watchMs, 1000);
});

test('recovery waiting spans source lookup and next-line decoding, preserving the episode first frame', () => {
  const f = fixture(); f.quality.open(); f.tick(500); f.quality.begin(item(), 0, true); f.tick(1000); f.quality.frame();
  f.tick(10000, 'buffering'); f.tick(12000); f.quality.fail(); f.quality.wait(); f.tick(5000);
  f.quality.begin(item(), 1, true); f.tick(2000); f.quality.frame();
  assert.equal(f.quality.state.firstFrameMs, 1500); assert.equal(f.quality.state.recoveryMs, 7000);
  assert.equal(f.quality.state.attempts, 2); assert.equal(f.quality.state.bufferMs, 12000);
  assert.equal(f.quality.profile(item(), 0).failureRate, 1); assert.equal(f.quality.profile(item(), 1).frameMs, 2000);
});

test('interrupted source lookup excludes background waiting and resumes the same episode totals', () => {
  const f = fixture(); f.quality.begin(item(), 0); f.tick(1000); f.quality.frame(); f.tick(10000); f.quality.fail();
  f.quality.wait(); f.tick(2000); f.quality.wait('background'); f.tick(60000); assert.equal(f.quality.state.watchMs, 10000);
  f.tick(0, 'loading'); f.tick(3000); f.quality.begin(item(), 1, true); f.tick(1000); f.quality.frame();
  assert.equal(f.quality.state.firstFrameMs, 1000); assert.equal(f.quality.state.recoveryMs, 6000);
  assert.equal(f.quality.state.attempts, 2); assert.equal(f.records()[0].samples.length, 1);
  f.quality.wait('unknown'); assert.equal(f.quality.state.phase, 'loading');
});

test('manual cancellation and stale events never invent success or failure; later errors update the same sample', () => {
  const f = fixture(); f.quality.begin(item(), 0); f.tick(3000); f.quality.finish();
  f.quality.fail(); assert.equal(f.quality.frame(), false); assert.deepEqual(f.records(), []);
  f.quality.begin(item(), 0); f.tick(1000); f.quality.frame('playing'); f.tick(10000); f.quality.fail(); f.quality.fail(); f.quality.finish();
  assert.equal(f.records()[0].samples.length, 1); assert.equal(f.records()[0].samples[0].failed, true);
  assert.equal(f.quality.state.evidence, 'playing');
});

test('recent real viewing prioritizes reliable lines and matching episodes without overwriting natural unknown order', () => {
  const f = fixture(); const video = item(); assert.equal(f.quality.chooseLine(video, '第02集'), 0);
  f.quality.begin(video, 0); f.tick(1000); f.quality.fail(); f.quality.finish(); success(f, video, 1);
  assert.equal(f.quality.chooseLine(video, '第02集'), 1); assert.equal(f.quality.profile(video, 1).label, '近期较顺畅');
  assert.ok(f.quality.priority(video, 0) > f.quality.priority(video, 1)); assert.equal(f.quality.priority(video), f.quality.priority(video, 1));
  video.lines[1].episodes = [{ name: '第03集' }]; assert.equal(f.quality.chooseLine(video, '第02集'), 0);
  assert.equal(f.quality.chooseLine(video, '特别篇'), 0); assert.equal(f.quality.chooseLine({ ...video, lines: [] }), 0);
  assert.equal(f.quality.priority({ source: 'ruyi' }), 8000);
  video.category = '电影'; assert.equal(f.quality.chooseLine(video, 'HD国语'), 1);
});

test('recent samples are bounded and weighted, bad sources rank below unknown ones, timeouts remain conservative', () => {
  const f = fixture(); const video = item('ruyi', ['slow']);
  assert.equal(f.quality.startupTimeout(video, 0), 15000); success(f, video, 0, 7000);
  assert.equal(f.quality.startupTimeout(video, 0), 17000);
  for (let i = 0; i < 6; i++) { f.quality.begin(video, 0); f.quality.fail(); f.quality.finish(); }
  assert.equal(f.quality.profile(video, 0).samples, 5); assert.equal(f.quality.profile(video, 0).label, '近期失败较多');
  assert.ok(f.quality.priority(video) > f.quality.priority(item())); assert.equal(f.quality.startupTimeout(video, 0), 10000);
  success(f, video, 0, 20000); assert.equal(f.quality.startupTimeout(video, 0), 20000);
});

test('available backups shorten unknown and recently failing startups while proven slow lines keep their budget', () => {
  const f = fixture(); const video = item('ruyi', ['slow']);
  assert.equal(f.quality.startupTimeout(video, 0, true), 8000); assert.equal(f.quality.startupTimeout(video, 0, false), 15000);
  success(f, video, 0, 7000); assert.equal(f.quality.startupTimeout(video, 0, true), 17000);
  for (let i = 0; i < 5; i++) { f.quality.begin(video, 0); f.quality.fail(); f.quality.finish(); }
  assert.equal(f.quality.startupTimeout(video, 0, true), 6000); assert.equal(f.quality.startupTimeout(video, 0), 10000);
});

test('storage is sanitized, missing or blocked storage degrades, and expired or future observations are ignored', () => {
  for (const value of ['broken', '{}', JSON.stringify([{ key: 'unknown|x', updatedAt: 100, samples: [] }])]) {
    const quality = createPlaybackExperience({ storage: { getItem: () => value } }); assert.equal(quality.profile(item(), 0).samples, 0);
  }
  const blocked = fixture({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } } });
  success(blocked, item(), 0); assert.equal(blocked.quality.profile(item(), 0).samples, 1); blocked.quality.clear();
  const f = fixture(); success(f, item(), 0); const saved = f.records(); saved[0].secretURL = 'https://private.example/token'; saved[0].samples[0].url = 'private';
  saved.push({ key: 'liangzi|invalid', updatedAt: 1000000, samples: [{ firstFrameMs: -1, watchMs: 0, bufferMs: 0, buffers: 0, failed: true }] });
  const loaded = createPlaybackExperience({ storage: { getItem: () => JSON.stringify(saved) }, wallNow: () => 1000000 });
  assert.equal(loaded.profile(item(), 0).samples, 1); assert.equal(loaded.profile(item('liangzi', ['invalid']), 0).samples, 0);
  const future = createPlaybackExperience({ storage: f.storage, wallNow: () => 999999 }); assert.equal(future.profile(item(), 0).samples, 0);
  f.age(86400001); assert.equal(f.quality.profile(item(), 0).samples, 0);
});

test('profile storage is bounded, contains no video identifiers or URLs, and clearing cannot resurrect the active sample', () => {
  const f = fixture({ maximum: 2 });
  for (let i = 0; i < 4; i++) { f.age(1); success(f, item('liangzi', ['line' + i]), 0); }
  assert.equal(f.records().length, 2); assert.doesNotMatch(JSON.stringify(f.records()), /url|episodes|vod_id|m3u8/);
  f.quality.begin(item(), 0); f.tick(1000); f.quality.frame(); f.quality.clear(); f.quality.finish(); assert.deepEqual(f.records(), []);
  assert.equal(f.quality.profile(item(), 0).samples, 0); success(f, item(), 0); assert.equal(f.quality.profile(item(), 0).samples, 1);
  const invalid = fixture(); success(invalid, item('unknown'), 0); assert.deepEqual(invalid.records(), []);
  invalid.quality.open('unknown'); invalid.tick(1000, 'unknown'); assert.equal(invalid.quality.state.phase, 'idle');
});
