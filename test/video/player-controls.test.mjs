import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaClock, createPlayerControls } from '../../source/video/player-controls.js';

function fixture({ paused = true, duration = 120, volume = 1, source = 'movie.mp4' } = {}) {
  function element() {
    const listeners = new Map(), classes = new Set(), attributes = new Map(), styles = new Map();
    return { listeners, classes, attributes, styles, value: '', hidden: true, disabled: false, hover: false, keyboard: false,
      classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } },
      style: { setProperty: (name, value) => styles.set(name, value) },
      setAttribute: (name, value) => attributes.set(name, value), getAttribute: name => attributes.get(name),
      matches: () => false,
      addEventListener(name, handler) { const group = listeners.get(name) || new Set(); group.add(handler); listeners.set(name, group); },
      removeEventListener: (name, handler) => listeners.get(name)?.delete(handler),
      emit(name, event = {}) { return Promise.all([...(listeners.get(name) || [])].map(handler => handler(event))); },
    };
  }
  const nodes = Object.fromEntries(['play', 'seek', 'time', 'mute', 'volume', 'fullscreen', 'rate', 'seek-preview', 'volume-value'].map(name => [name, element()]));
  nodes.seek.getBoundingClientRect = () => ({ left: 100, width: 200 });
  for (const node of Object.values(nodes)) node.matches = selector => selector === ':focus-visible' && node.keyboard;
  const controls = element(), screen = element(), document = element(), video = element(), timers = new Map(), errors = [];
  let timerId = 0, fullscreenRequests = 0;
  controls.querySelector = selector => nodes[selector.match(/"([^"]+)"/)[1]];
  controls.contains = node => Object.values(nodes).includes(node); controls.matches = () => controls.hover;
  document.activeElement = null; document.fullscreenElement = null; screen.ownerDocument = document;
  Object.assign(video, { controls: true, paused, duration, volume, muted: false, ended: false, playbackRate: 1, currentTime: 0, currentSrc: source, readyState: source ? 1 : 0,
    buffered: { length: 1, start: () => 0, end: () => 60 },
    play() { this.paused = false; this.emit('play'); return Promise.resolve(); }, pause() { this.paused = true; this.emit('pause'); },
  });
  video.attributes.set('src', source);
  const options = { screen, controls, onError: message => errors.push(message), onFullscreen: event => { assert.ok(event); fullscreenRequests++; },
    setTimer: callback => { timers.set(++timerId, callback); return timerId; }, clearTimer: id => timers.delete(id),
  };
  const player = createPlayerControls(video, options);
  return { video, nodes, controls, screen, document, timers, errors, player, options, fullscreenRequests: () => fullscreenRequests,
    expire() { for (const callback of [...timers.values()]) callback(); timers.clear(); },
  };
}

test('media clocks handle seconds, hours, fractions and unknown durations', () => {
  for (const [value, expected] of [[0, '0:00'], [9.9, '0:09'], [65, '1:05'], [3599, '59:59'], [3600, '1:00:00'], [3661, '1:01:01']]) assert.equal(mediaClock(value), expected);
  for (const value of [undefined, NaN, Infinity, -1, '60', null]) assert.equal(mediaClock(value), '--:--');
});

test('initialization is progressive and missing controls preserve the native player', () => {
  const page = fixture();
  assert.equal(page.video.controls, false); assert.equal(page.controls.hidden, false); assert.ok(page.screen.classes.has('custom-controls'));
  assert.equal(page.nodes.play.attributes.get('aria-label'), '播放'); assert.equal(page.nodes.time.textContent, '0:00 / 2:00');
  page.player.destroy(); delete page.nodes.seek;
  assert.equal(createPlayerControls(page.video, page.options), null); assert.equal(page.video.controls, true); assert.equal(page.controls.hidden, true);
  assert.equal(createPlayerControls(undefined), null);
});

test('play, pause, ended and external media events keep icons and accessible names current', async () => {
  const page = fixture();
  await page.nodes.play.emit('click'); assert.equal(page.video.paused, false); assert.equal(page.nodes.play.attributes.get('aria-label'), '暂停');
  await page.video.emit('click'); assert.equal(page.video.paused, true); assert.equal(page.nodes.play.attributes.get('aria-label'), '播放');
  page.video.paused = false; page.video.ended = true; await page.video.emit('ended');
  assert.equal(page.nodes.play.attributes.get('aria-label'), '播放'); assert.equal(page.screen.classes.has('is-playing'), false);
  page.video.ended = false; await page.nodes.play.emit('click'); assert.equal(page.video.paused, true);
  page.video.attributes.delete('src'); page.video.readyState = 0; await page.video.emit('emptied');
  assert.equal(page.nodes.play.disabled, true); await page.video.emit('click'); assert.equal(page.video.paused, true);
});

test('play errors are localized while cancellations, old sources and disposed requests stay quiet', async () => {
  const page = fixture();
  page.video.play = () => Promise.reject(Error('private upstream address'));
  await page.nodes.play.emit('click'); assert.deepEqual(page.errors, ['暂时无法开始播放，请重试或切换来源。']);
  page.errors.length = 0; page.video.play = () => Promise.reject(Object.assign(Error('cancelled'), { name: 'AbortError' }));
  await page.nodes.play.emit('click'); assert.equal(page.errors.length, 0);
  let reject; page.video.play = () => new Promise((_resolve, fail) => { reject = fail; });
  const old = page.nodes.play.emit('click'); page.video.currentSrc = 'next.mp4'; reject(Error('old failure')); await old;
  assert.equal(page.errors.length, 0);
  const disposed = page.nodes.play.emit('click'); page.player.destroy(); reject(Error('disposed')); await disposed;
  assert.equal(page.errors.length, 0);
});

test('a newer play request suppresses errors from an older request on the same source', async () => {
  const page = fixture(), rejects = [];
  page.video.play = () => new Promise((_resolve, reject) => rejects.push(reject));
  const first = page.nodes.play.emit('click'), second = page.nodes.play.emit('click');
  rejects[0](Error('first')); await first; assert.equal(page.errors.length, 0);
  rejects[1](Error('second')); await second; assert.equal(page.errors.length, 1);
});

test('drag previews do not seek until release and do not get replaced by timeupdate events', async () => {
  const page = fixture(); page.video.currentTime = 20; page.player.refresh();
  page.nodes.seek.value = '750'; await page.nodes.seek.emit('input');
  assert.equal(page.nodes.time.textContent, '1:30 / 2:00'); assert.equal(page.video.currentTime, 20);
  await page.video.emit('timeupdate'); assert.equal(page.nodes.seek.value, '750'); assert.equal(page.nodes.time.textContent, '1:30 / 2:00');
  await page.nodes.seek.emit('change'); assert.equal(page.video.currentTime, 90); assert.equal(page.video.paused, true);
  assert.equal(page.nodes.seek.attributes.get('aria-valuetext'), '1:30 / 2:00');
  page.nodes.seek.value = '-500'; await page.nodes.seek.emit('change'); assert.equal(page.video.currentTime, 0);
  page.nodes.seek.value = '9000'; await page.nodes.seek.emit('change'); assert.equal(page.video.currentTime, 120);
});

test('cancelled or blurred drags restore the media position without seeking', async () => {
  const page = fixture(); page.video.currentTime = 30;
  for (const event of ['pointercancel', 'blur']) {
    page.nodes.seek.value = '900'; await page.nodes.seek.emit('input'); await page.nodes.seek.emit(event);
    assert.equal(page.video.currentTime, 30); assert.equal(page.nodes.seek.value, '250');
  }
});

test('switching episodes cancels a scrub preview and suppresses pending errors even when the source URL is reused', async () => {
  const page = fixture(); let reject;
  page.nodes.seek.value = '800'; await page.nodes.seek.emit('input');
  page.video.play = () => new Promise((_resolve, fail) => { reject = fail; });
  const pending = page.nodes.play.emit('click'); page.video.duration = NaN; page.video.currentTime = 0;
  await page.video.emit('loadstart'); reject(Error('previous episode')); await pending;
  assert.equal(page.nodes.seek.value, '0'); assert.equal(page.nodes.time.textContent, '0:00 / --:--'); assert.equal(page.errors.length, 0);
});

test('seek keys move by fixed seconds, clamp bounds and leave modifier shortcuts alone', async () => {
  const page = fixture(); let prevented = 0;
  for (const [key, expected] of [['ArrowRight', 10], ['PageUp', 70], ['ArrowLeft', 60], ['PageDown', 0], ['End', 120], ['ArrowRight', 120], ['Home', 0], ['ArrowLeft', 0]]) {
    await page.nodes.seek.emit('keydown', { key, preventDefault() { prevented++; } }); assert.equal(page.video.currentTime, expected);
  }
  assert.equal(prevented, 8);
  for (const event of [{ key: 'ArrowRight', altKey: true }, { key: 'ArrowRight', ctrlKey: true }, { key: 'ArrowRight', metaKey: true }, { key: 'Tab' }]) await page.nodes.seek.emit('keydown', { ...event, preventDefault() { assert.fail('Must preserve unrelated keys'); } });
  assert.equal(page.video.currentTime, 0);
});

test('unloaded or live media disables seeking and resets progress on episode changes', async () => {
  const page = fixture(); page.video.currentTime = 60; page.player.refresh();
  assert.equal(page.controls.styles.get('--played'), '50%');
  for (const duration of [0, NaN, Infinity]) {
    page.video.duration = duration; page.video.currentTime = 0; await page.video.emit('durationchange');
    assert.equal(page.nodes.seek.disabled, true); assert.equal(page.nodes.seek.value, '0'); assert.equal(page.nodes.time.textContent, '0:00 / --:--');
    await page.nodes.seek.emit('keydown', { key: 'ArrowRight', preventDefault() { assert.fail('No finite duration'); } });
    await page.nodes.seek.emit('change'); assert.equal(page.video.currentTime, 0);
  }
});

test('seek failures preserve playback and show a safe message', async () => {
  const page = fixture(); Object.defineProperty(page.video, 'currentTime', { get: () => 30, set() { throw Error('private details'); } });
  page.nodes.seek.value = '500'; await page.nodes.seek.emit('change');
  assert.equal(page.video.currentTime, 30); assert.deepEqual(page.errors, ['暂时无法跳转，已保留当前播放位置。']);
});

test('buffer display follows the range containing playback and tolerates replaced ranges', async () => {
  const page = fixture(); page.video.currentTime = 15;
  page.video.buffered = { length: 2, start: index => [0, 90][index], end: index => [60, 120][index] };
  await page.video.emit('progress'); assert.equal(page.controls.styles.get('--buffered'), '50%');
  page.video.currentTime = 100; page.player.refresh(); assert.equal(page.controls.styles.get('--buffered'), '100%');
  page.video.buffered = { get length() { throw Error('replaced'); } }; page.player.refresh();
  assert.equal(page.controls.styles.get('--buffered'), '0%');
});

test('mute, volume zero and external volume changes retain a usable restore level', async () => {
  const page = fixture({ volume: .4 });
  await page.nodes.mute.emit('click'); assert.equal(page.video.muted, true); assert.equal(page.nodes.volume.value, '0');
  assert.equal(page.nodes.mute.attributes.get('aria-label'), '解除静音'); assert.equal(page.nodes.mute.attributes.get('aria-pressed'), 'true');
  await page.nodes.mute.emit('click'); assert.equal(page.video.muted, false); assert.equal(page.video.volume, .4);
  page.nodes.volume.value = '0'; await page.nodes.volume.emit('input'); assert.equal(page.video.muted, true);
  await page.nodes.mute.emit('click'); assert.equal(page.video.volume, .4); assert.equal(page.video.muted, false);
  page.nodes.volume.value = '75'; await page.nodes.volume.emit('input'); assert.equal(page.video.volume, .75); assert.equal(page.nodes.volume.attributes.get('aria-valuetext'), '75%');
  page.video.volume = .2; await page.video.emit('volumechange'); assert.equal(page.nodes.volume.value, '20');
  for (const [value, expected] of [['900', 1], ['-100', 0], ['broken', 0]]) { page.nodes.volume.value = value; await page.nodes.volume.emit('input'); assert.equal(page.video.volume, expected); }
  const silent = fixture({ volume: 0 }); await silent.nodes.mute.emit('click'); assert.equal(silent.video.volume, 1);
});

test('idle controls hide only during playback and stay usable for hover, keyboard focus and pause', async () => {
  const page = fixture({ paused: false }); await page.screen.emit('pointermove'); page.expire();
  assert.equal(page.screen.classes.has('controls-idle'), true);
  await page.screen.emit('pointermove'); assert.equal(page.screen.classes.has('controls-idle'), false);
  page.controls.hover = true; page.expire(); assert.equal(page.screen.classes.has('controls-idle'), false);
  page.controls.hover = false; page.document.activeElement = page.nodes.play; page.nodes.play.keyboard = true;
  await page.screen.emit('focusin'); page.expire(); assert.equal(page.screen.classes.has('controls-idle'), false);
  page.nodes.play.keyboard = false; await page.screen.emit('focusout'); page.expire(); assert.equal(page.screen.classes.has('controls-idle'), true);
  page.video.pause(); assert.equal(page.screen.classes.has('controls-idle'), false); assert.equal(page.timers.size, 0);
  page.video.paused = false; await page.screen.emit('pointerleave'); page.video.paused = true; page.expire();
  assert.equal(page.screen.classes.has('controls-idle'), false);
});

test('fullscreen delegates to the existing owner and teardown removes listeners and restores native controls', async () => {
  const page = fixture({ paused: false });
  await page.nodes.fullscreen.emit('click', { currentTarget: page.nodes.fullscreen }); assert.equal(page.fullscreenRequests(), 1);
  page.document.fullscreenElement = page.screen; await page.document.emit('fullscreenchange');
  assert.equal(page.nodes.fullscreen.attributes.get('aria-label'), '退出全屏');
  page.document.fullscreenElement = null; await page.document.emit('fullscreenchange'); assert.equal(page.nodes.fullscreen.attributes.get('aria-label'), '全屏');
  page.player.destroy(); page.player.destroy(); page.player.refresh();
  assert.equal(page.video.controls, true); assert.equal(page.controls.hidden, true); assert.equal(page.timers.size, 0);
  for (const target of [page.video, page.screen, page.document, ...Object.values(page.nodes)]) for (const listeners of target.listeners.values()) assert.equal(listeners.size, 0);
  const optional = fixture(); optional.player.destroy(); delete optional.nodes.rate; const player = createPlayerControls(optional.video, { ...optional.options, onFullscreen: undefined, onError: undefined });
  await optional.nodes.fullscreen.emit('click', {}); optional.video.play = () => Promise.reject(Error('unavailable')); await optional.nodes.play.emit('click'); player.destroy();
});

test('fullscreen rate controls follow external changes and reject malformed or unsupported rates', async () => {
  const page = fixture();
  page.nodes.rate.value = '1.5'; await page.nodes.rate.emit('change'); assert.equal(page.video.playbackRate, 1.5);
  page.video.playbackRate = 2; await page.video.emit('ratechange'); assert.equal(page.nodes.rate.value, '2');
  for (const value of ['broken', '-1', '0', '3']) { page.nodes.rate.value = value; await page.nodes.rate.emit('change'); assert.equal(page.video.playbackRate, 2); assert.equal(page.nodes.rate.value, '2'); }
  Object.defineProperty(page.video, 'playbackRate', { get: () => 1, set() { throw Error('unsupported'); } });
  page.nodes.rate.value = '1.5'; await page.nodes.rate.emit('change'); assert.deepEqual(page.errors, ['暂时无法切换倍速。']);
});

test('Escape exits the player fullscreen only after an open menu has released the event', async () => {
  const page = fixture(); let prevented = 0;
  const event = { key: 'Escape', preventDefault() { prevented++; } };
  await page.document.emit('keydown', event); assert.equal(page.fullscreenRequests(), 0);
  page.document.fullscreenElement = page.screen;
  await page.document.emit('keydown', { ...event, defaultPrevented: true }); assert.equal(page.fullscreenRequests(), 0);
  await page.document.emit('keydown', { ...event, key: 'Tab' }); assert.equal(page.fullscreenRequests(), 0);
  await page.document.emit('keydown', event); assert.equal(page.fullscreenRequests(), 1); assert.equal(prevented, 1);
});

test('hovering previews a time without seeking, changing progress or playing the video', async () => {
  const page = fixture(); page.video.currentTime = 20; page.player.refresh();
  const played = page.controls.styles.get('--played');
  await page.nodes.seek.emit('pointermove', { clientX: 200, pointerType: 'mouse' });
  assert.equal(page.nodes['seek-preview'].textContent, '1:00'); assert.equal(page.nodes['seek-preview'].hidden, false);
  assert.equal(page.nodes['seek-preview'].styles.get('--seek-x'), '100px');
  assert.equal(page.video.currentTime, 20); assert.equal(page.video.paused, true);
  assert.equal(page.controls.styles.get('--played'), played); assert.equal(page.nodes.time.textContent, '0:20 / 2:00');
  for (const [clientX, time, offset] of [[-1, '0:00', '32px'], [900, '2:00', '168px']]) {
    await page.nodes.seek.emit('pointermove', { clientX, pointerType: 'mouse' });
    assert.equal(page.nodes['seek-preview'].textContent, time); assert.equal(page.nodes['seek-preview'].styles.get('--seek-x'), offset);
  }
  await page.nodes.seek.emit('pointerleave'); assert.equal(page.nodes['seek-preview'].hidden, true);
  await page.nodes.seek.emit('pointermove', { clientX: 200, pointerType: 'touch' }); assert.equal(page.nodes['seek-preview'].hidden, true);
});

test('drag and keyboard previews stay aligned and clear on cancellation, blur and source changes', async () => {
  const page = fixture(); page.nodes.seek.value = '750'; await page.nodes.seek.emit('input');
  await page.nodes.seek.emit('pointerleave'); assert.equal(page.nodes['seek-preview'].hidden, false);
  assert.equal(page.nodes['seek-preview'].textContent, '1:30'); assert.equal(page.video.currentTime, 0);
  await page.nodes.seek.emit('pointercancel'); assert.equal(page.nodes['seek-preview'].hidden, true);
  await page.nodes.seek.emit('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(page.nodes['seek-preview'].textContent, '0:10'); assert.equal(page.video.currentTime, 10);
  await page.nodes.seek.emit('blur'); assert.equal(page.nodes['seek-preview'].hidden, true);
  await page.nodes.seek.emit('pointermove', { clientX: 200 }); await page.video.emit('loadstart'); assert.equal(page.nodes['seek-preview'].hidden, true);
  page.nodes.seek.getBoundingClientRect = () => ({ left: 0, width: 20 }); await page.nodes.seek.emit('pointermove', { clientX: 0 });
  assert.equal(page.nodes['seek-preview'].styles.get('--seek-x'), '10px');
  await page.document.emit('fullscreenchange'); assert.equal(page.nodes['seek-preview'].hidden, true);
});

test('unknown duration or hidden controls never show stale seek previews', async () => {
  const page = fixture();
  for (const duration of [NaN, Infinity, 0]) {
    page.video.duration = duration; await page.nodes.seek.emit('pointermove', { clientX: 200 });
    assert.equal(page.nodes['seek-preview'].hidden, true);
  }
  page.video.duration = 120; page.nodes.seek.getBoundingClientRect = () => ({ left: 0, width: 0 });
  await page.nodes.seek.emit('input'); assert.equal(page.nodes['seek-preview'].hidden, true);
  page.nodes.seek.getBoundingClientRect = () => ({ left: 0, width: 200 }); await page.nodes.seek.emit('pointermove', { clientX: NaN });
  assert.equal(page.nodes['seek-preview'].hidden, true);
});

test('visible volume percentages and fill reflect actual output including muted audio', async () => {
  const page = fixture({ volume: .4 });
  assert.equal(page.nodes['volume-value'].textContent, '40%'); assert.equal(page.controls.styles.get('--volume'), '40%');
  await page.nodes.mute.emit('click'); assert.equal(page.nodes['volume-value'].textContent, '0%'); assert.equal(page.controls.styles.get('--volume'), '0%');
  await page.nodes.mute.emit('click'); assert.equal(page.nodes['volume-value'].textContent, '40%');
});

test('buffering keeps the pause action accessible and visible without an idle timer', async () => {
  const page = fixture({ paused: false }); await page.video.emit('waiting');
  assert.equal(page.screen.classes.has('is-buffering'), true); assert.equal(page.timers.size, 0);
  assert.equal(page.nodes.play.attributes.get('aria-label'), '暂停'); page.expire(); assert.equal(page.screen.classes.has('controls-idle'), false);
  for (const event of ['playing', 'canplay', 'seeked', 'pause', 'ended', 'emptied']) {
    page.video.paused = false; await page.video.emit('waiting'); await page.video.emit(event);
    assert.equal(page.screen.classes.has('is-buffering'), false);
  }
  page.video.paused = true; await page.video.emit('waiting'); assert.equal(page.screen.classes.has('is-buffering'), false);
});
