import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackQuality } from '../../source/video/playback.js';

const levels = [{ width: 640, height: 360, bitrate: 800000 }, { width: 1280, height: 720, bitrate: 2500000 }, { width: 1920, height: 1080, bitrate: 5000000 }];

test('real quality choices retain HLS indices while sorting resolution and labeling actual decoded dimensions', () => {
  const result = playbackQuality(levels, { ready: true, width: 1920, height: 1080, current: 2 });
  assert.equal(result.selectable, true); assert.equal(result.selected, -1); assert.equal(result.pending, false);
  assert.deepEqual(result.choices.map(({ index, label }) => [index, label]), [[2, '1080p'], [1, '720p'], [0, '360p']]);
  assert.equal(result.currentLabel, '当前画面：1080p · 1920×1080'); assert.match(result.note, /自动/);
  assert.deepEqual(levels.map(level => level.height), [360, 720, 1080]);
});

test('manual choice distinguishes pending buffered quality from current picture, including a paused switch', () => {
  let result = playbackQuality(levels, { ready: true, selected: 1, current: 2, width: 1920, height: 1080 });
  assert.equal(result.selected, 1); assert.equal(result.pending, true); assert.match(result.note, /已选择 720p.*缓冲/);
  result = playbackQuality(levels, { ready: true, selected: 1, current: 1, width: 1920, height: 1080, paused: true });
  assert.equal(result.pending, true); assert.match(result.note, /继续播放后切换/);
  result = playbackQuality(levels, { ready: true, selected: 1, current: 1, width: 1280, height: 720 });
  assert.equal(result.pending, false); assert.equal(result.note, '已使用 720p。');
  result = playbackQuality(levels, { ready: true, selected: 1, current: 1 });
  assert.equal(result.pending, false); assert.match(result.currentLabel, /尚未取得/);
});

test('single renditions and native playback never advertise unavailable manual choices', () => {
  assert.match(playbackQuality().note, /正在读取/);
  for (const value of [undefined, null, {}, [], [null], [levels[2]]]) {
    const result = playbackQuality(value, { ready: true, selected: 0, width: 1920, height: 1080 });
    assert.equal(result.selectable, false); assert.equal(result.selected, -1); assert.match(result.note, /未提供多个/);
    assert.match(result.currentLabel, /1920×1080/);
  }
  const native = playbackQuality(levels, { ready: true, native: true, selected: 2 });
  assert.equal(native.selectable, false); assert.equal(native.selected, -1); assert.match(native.note, /浏览器自动适配/);
});

test('invalid selections, malformed levels and unreasonable dimensions cannot invent quality or leak URLs', () => {
  for (const selected of [99, NaN, Infinity, 1.5, '1', -2]) assert.equal(playbackQuality(levels, { ready: true, selected }).selected, -1);
  const result = playbackQuality([null, { audioOnly: true }, { width: '3840', height: Infinity, bitrate: -1, name: '4K', url: 'https://private.invalid/key' }, { width: 0, height: 20000, bitrate: Infinity }], { ready: true, width: -1, height: 1080.5 });
  assert.deepEqual(result.choices.map(choice => choice.label), ['档位 3', '档位 4']);
  assert.match(result.currentLabel, /尚未取得/); assert.doesNotMatch(JSON.stringify(result), /4K|private|https/);
  assert.equal(playbackQuality(Array.from({ length: 150 }, () => ({}))).choices.length, 100);
});

test('portrait and cropped pictures report actual dimensions without promoting a source label to 4K', () => {
  assert.equal(playbackQuality([], { width: 720, height: 1254 }).currentLabel, '当前画面：720p · 720×1254');
  assert.equal(playbackQuality([{ name: '4K' }], { ready: true, width: 1920, height: 816 }).currentLabel, '当前画面：816p · 1920×816');
  assert.equal(playbackQuality([], { width: 3840, height: 2160 }).currentLabel, '当前画面：2160p · 3840×2160');
});

test('duplicate resolutions and metadata-free renditions remain distinct using numeric bandwidth and stable indices', () => {
  const result = playbackQuality([{ width: 1280, height: 720, bitrate: 2500000 }, { width: 1280, height: 720, bitrate: 2500000 }, { width: 1280, height: 720 }, { bitrate: 1500000 }, { bitrate: 500000 }], { ready: true });
  assert.equal(new Set(result.choices.map(choice => choice.label)).size, 5);
  assert.match(result.choices[0].label, /720p.*2.5 Mbps.*档位 1/);
  assert.match(result.choices[2].label, /720p.*档位 3/);
  assert.equal(result.choices[3].label, '1.5 Mbps');
  const unknown = playbackQuality([{}, {}], { ready: true, selected: 0, current: 0 });
  assert.equal(unknown.pending, false); assert.equal(unknown.note, '已使用 档位 1。');
});
