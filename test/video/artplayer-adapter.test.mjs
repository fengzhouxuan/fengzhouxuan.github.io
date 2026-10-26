import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtPlayer } from '../../source/video/artplayer-adapter.js';

function fixture({ fail = false, omitIcons = false, duration = 120, withLayout = false, previews = false, withEpisodes = false, withQuality = false, volume = .4, muted = true } = {}) {
  function node(tagName = 'DIV') {
    const listeners = new Map(), attrs = new Map(), classes = new Set(), captures = new Set();
    return { tagName, children: [], className: '', dataset: {}, style: { setProperty(name, value) { this[name] = value; } }, hidden: false, attrs, classes, listeners,
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } },
      setAttribute: (name, value) => attrs.set(name, value), getAttribute: name => attrs.get(name),
      removeAttribute: name => attrs.delete(name),
      addEventListener(name, fn, options) { const group = listeners.get(name) || new Set(); group.add(fn); listeners.set(name, group); if (options?.capture) captures.add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); captures.delete(fn); },
      emit(name, event = {}) { for (const fn of [...(listeners.get(name) || [])].sort((a, b) => Number(captures.has(b)) - Number(captures.has(a)))) { fn(event); if (event.immediate) break; } },
      dispatchEvent(event) { this.emit(event.type, event); },
      contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      focus() { doc.activeElement = this; },
      append(...items) { items.forEach(x => { x.parentElement?.removeChild?.(x); this.children.push(x); x.parentElement = this; }); },
      removeChild(x) { this.children = this.children.filter(item => item !== x); },
      insertBefore(x, anchor) { x.parentElement?.removeChild?.(x); const index = this.children.indexOf(anchor); this.children.splice(index < 0 ? this.children.length : index, 0, x); x.parentElement = this; },
      remove() { this.parentElement?.removeChild(this); this.parentElement = null; },
      querySelector(selector) { for (const child of this.children) { if (child.className.split(' ').includes(selector.slice(1))) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; }, getBoundingClientRect: () => ({ left: 100, width: 200 }),
    };
  }
  const doc = node(), screen = node(), controls = node(), video = node('VIDEO'), sibling = node(), right = node(), progress = node(), player = node();
  const layout = node(), episodePanel = node(), qualityParent = node(); let qualityModel;
  doc.getElementById = id => withQuality && id === 'quality-select' ? qualityModel : withEpisodes && id === 'episode-panel' ? episodePanel : withLayout && id === 'watch-layout' ? layout : null;
  doc.location = { href: 'https://blog.example/video/' }; doc.body = node();
  const icons = Object.fromEntries(['.art-control-playAndPause', '.art-icon-volume', '.art-icon-volumeClose', '.art-volume-slider', '.art-control-time'].map(name => [name, node()]));
  player.querySelector = selector => omitIcons ? null : icons[selector];
  doc.createElement = tag => { const item = node(tag.toUpperCase()); item.ownerDocument = doc; if (tag === 'select') Object.defineProperty(item, 'options', { get: () => item.children }); return item; };
  if (withQuality) { qualityModel = doc.createElement('select'); qualityModel.id = 'quality-select'; qualityModel.disabled = true; qualityParent.append(qualityModel); }
  doc.defaultView = node(); let desktop = true, active = true;
  doc.defaultView.matchMedia = () => ({ matches: desktop }); player.contains = target => target === player;
  screen.ownerDocument = doc; screen.append(video, sibling); video.nextSibling = sibling;
  Object.assign(video, { controls: true, className: 'original', volume, muted, playbackRate: 1.25, duration, currentTime: 20, paused: true, readyState: 4, src: 'blob:existing-hls', play() { this.paused = false; this.emit('play'); return Promise.resolve(); }, pause() { this.paused = true; this.emit('pause'); } });
  let options, instance, destroyed = 0, fullscreens = 0; const errors = [];
  class Artplayer {
    constructor(value) {
      options = value; const media = value.proxy(); assert.equal(media, video);
      value.container.append(video); video.className = 'art-video'; video.controls = false;
      if (fail) { video.volume = .7; throw Error('private internal details'); }
      this.template = { $controlsRight: right, $progress: progress, $player: player, $state: node() }; this.controls = {}; this.loading = {}; this.emissions = []; this.callbacks = new Map(); this.removed = [];
      this.on = (name, fn) => this.callbacks.set(name, fn); this.off = name => { this.removed.push(name); this.callbacks.delete(name); };
      this.emit = (...args) => { this.emissions.push(args); this.callbacks.get(args[0])?.(...args.slice(1)); }; this.destroy = () => destroyed++; instance = this;
    }
  }
  const ui = createArtPlayer(video, { screen, controls, Artplayer, onFullscreen: () => fullscreens++, onError: message => errors.push(message), isActive: () => active,
    getEpisodeState: withEpisodes ? () => ({ count: 3, current: 0 }) : undefined, onNext: withEpisodes ? () => assert.fail('pending countdown must be cancelled') : undefined,
    getPreviewSource: previews ? () => 'https://x.workers.dev/video' : undefined });
  const event = (key, extra = {}) => ({ key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.immediate = true; this.stopped = true; }, ...extra });
  return { ui, doc, screen, video, controls, sibling, right, progress, player, icons, layout, episodePanel, qualityModel, qualityParent, desktop: value => desktop = value, active: value => active = value, event, errors, Artplayer, options: () => options, instance: () => instance, destroyed: () => destroyed, fullscreens: () => fullscreens };
}

test('in-player quality shares the original selection model and restores it on teardown', () => {
  const p = fixture({ withQuality: true }); assert.ok(p.ui);
  for (const [value, text] of [['-1', '自动'], ['0', '360p'], ['1', '720p']]) {
    const option = p.doc.createElement('option'); option.value = value; option.textContent = text; p.qualityModel.append(option);
  }
  p.qualityModel.value = '-1'; p.qualityModel.disabled = false;
  p.ui.refreshQuality({ selectable: true, displayLabel: '360p' });
  assert.notEqual(p.qualityModel.parentElement, p.qualityParent);
  const host = p.qualityModel.parentElement; assert.ok(host.querySelector('.choice-menu'));
  p.doc.defaultView.emit('resize'); assert.ok(host.querySelector('.choice-menu'));
  p.ui.refreshQuality({ selectable: false, displayLabel: '608p' }); assert.equal(host.querySelector('.choice-menu'), null);
  assert.equal(host.querySelector('.art-quality-current').textContent, '608p');
  assert.equal(p.video.src, 'blob:existing-hls'); assert.equal(p.video.currentTime, 20); assert.equal(p.video.paused, true);
  p.ui.destroy(); assert.equal(p.qualityModel.parentElement, p.qualityParent); assert.equal(p.qualityModel.hidden, false);
});

test('browsing existing episode or source controls cancels auto-next without changing playback', () => {
  const p = fixture({ withEpisodes: true }); p.video.ended = true;
  for (const type of ['focusin', 'click']) {
    p.ui.finish(); assert.ok(p.screen.children.find(node => node.className === 'art-auto-next'));
    p.episodePanel.emit(type); assert.equal(p.screen.children.find(node => node.className === 'art-auto-next'), undefined);
    assert.equal(p.video.currentTime, 20); assert.equal(p.video.paused, true);
  }
  p.ui.destroy();
});

test('theater mode is desktop-only, keeps shortcuts out of editors/menus and exits cleanly', () => {
  const p = fixture({ withLayout: true }), theater = p.right.children[2];
  p.doc.emit('keydown', p.event('t', { code: 'KeyT' })); assert.equal(theater.attrs.get('aria-pressed'), 'true'); assert.equal(p.layout.classes.has('theater-mode'), true);
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { isComposing: true }, { target: { tagName: 'INPUT' } }, { target: { isContentEditable: true } }, { target: { closest: () => true } }]) {
    p.doc.emit('keydown', p.event('t', { code: 'KeyT', ...extra })); assert.equal(theater.attrs.get('aria-pressed'), 'true');
  }
  p.doc.emit('keydown', p.event('Escape')); assert.equal(theater.attrs.get('aria-pressed'), 'false');
  theater.emit('click'); p.desktop(false); p.doc.defaultView.emit('resize'); assert.equal(theater.attrs.get('aria-pressed'), 'false');
  theater.emit('click'); assert.equal(theater.attrs.get('aria-pressed'), 'false');
  p.desktop(true); p.active(false); p.doc.emit('keydown', p.event('t', { code: 'KeyT' })); assert.equal(theater.attrs.get('aria-pressed'), 'false');
  p.active(true); p.doc.fullscreenElement = p.screen; p.doc.emit('keydown', p.event('t', { code: 'KeyT' })); assert.equal(theater.attrs.get('aria-pressed'), 'false');
  p.doc.fullscreenElement = null; theater.emit('click'); p.ui.destroy(); assert.equal(p.layout.classes.has('theater-mode'), false);
});

test('mute and player volume keys give feedback without seeking or stealing page arrows', () => {
  const p = fixture(); p.instance().notice = {};
  p.doc.emit('keydown', p.event('m', { code: 'KeyM' })); assert.equal(p.video.muted, false); assert.equal(p.instance().notice.show, '音量 40%');
  p.doc.emit('keydown', p.event('m', { code: 'KeyM' })); assert.equal(p.instance().notice.show, '已静音');
  p.doc.emit('keydown', p.event('ArrowUp', { target: p.player })); assert.equal(Math.round(p.video.volume * 100), 45);
  p.doc.emit('keydown', p.event('ArrowDown', { target: p.player })); assert.equal(Math.round(p.video.volume * 100), 40);
  const e = p.event('ArrowDown', { target: {} }); p.doc.emit('keydown', e); assert.equal(e.prevented, false); assert.equal(p.video.currentTime, 20);
});

test('play and mute keys ignore held-key repeats while mouse play uses the same guarded entry', async () => {
  const p = fixture(), play = p.icons['.art-control-playAndPause'], mute = p.icons['.art-icon-volume'];
  let nativeCalls = 0; play.addEventListener('click', () => nativeCalls++);
  play.emit('click', p.event('click')); assert.equal(p.video.paused, false); assert.equal(nativeCalls, 0);
  play.emit('keydown', p.event(' ', { repeat: true })); assert.equal(p.video.paused, false);
  mute.emit('keydown', p.event('Enter', { repeat: true })); assert.equal(p.video.muted, true);
  await p.ui.togglePlay(); assert.equal(p.video.paused, true);
  p.active(false); await p.ui.togglePlay(); assert.equal(p.video.paused, true);
  p.ui.destroy(); await p.ui.togglePlay(); assert.equal(p.video.paused, true);
});

test('rapid play then pause and navigation make an older play rejection silent', async () => {
  for (const action of ['pause', 'navigate']) {
    const p = fixture(); let reject;
    p.video.play = () => { p.video.paused = false; return new Promise((_resolve, fail) => reject = fail); };
    const pending = p.ui.togglePlay();
    if (action === 'pause') await p.ui.togglePlay(); else p.active(false);
    reject(Error('private stream failure')); await pending; assert.equal(p.errors.length, 0); p.ui.destroy();
  }
});

test('mixing Space, video clicks and the central play action supersedes old pending play errors', async () => {
  for (const action of ['video', 'center']) {
    const p = fixture(); let reject;
    p.video.play = () => { p.video.paused = false; return new Promise((_resolve, fail) => reject = fail); };
    const pending = p.ui.togglePlay();
    if (action === 'video') { p.instance().emit('click'); p.video.paused = true; }
    else p.instance().template.$state.emit('click', p.event('click'));
    reject(Error('private old play failure')); await pending; assert.equal(p.errors.length, 0); assert.equal(p.video.paused, true); p.ui.destroy();
  }
});

test('zero volume unmute restores the last audible level for M, pointer and accessible icon keys', () => {
  for (const action of ['M', 'pointer', 'Enter', 'Space']) {
    const p = fixture(), slider = p.icons['.art-volume-slider'], close = p.icons['.art-icon-volumeClose']; p.instance().notice = {};
    p.video.volume = .65; p.video.emit('volumechange'); slider.emit('keydown', p.event('Home'));
    assert.equal(slider.attrs.get('aria-valuenow'), '0'); assert.match(slider.attrs.get('aria-valuetext'), /恢复音量 65%/);
    let nativeClicks = 0; close.addEventListener('click', () => { nativeClicks++; p.video.muted = false; });
    if (action === 'M') p.doc.emit('keydown', p.event('m', { code: 'KeyM' }));
    else if (action === 'pointer') close.emit('click', p.event('click'));
    else close.emit('keydown', p.event(action === 'Space' ? ' ' : 'Enter'));
    assert.equal(p.video.muted, false); assert.equal(p.video.volume, .65); assert.equal(slider.attrs.get('aria-valuenow'), '65');
    assert.equal(p.instance().notice.show, '音量 65%'); assert.equal(nativeClicks, 0);
    assert.equal(p.video.currentTime, 20); assert.equal(p.video.paused, true); assert.equal(p.video.src, 'blob:existing-hls'); p.ui.destroy();
  }
});

test('mute indicators reflect actual output and a never-audible session has a usable fallback', () => {
  const p = fixture(); assert.equal(p.icons['.art-volume-slider'].attrs.get('aria-valuenow'), '0');
  const mute = p.icons['.art-icon-volume']; mute.emit('click', p.event('click')); assert.equal(p.video.muted, false);
  mute.emit('click', p.event('click')); assert.equal(p.video.muted, true); assert.equal(p.video.volume, .4);
  p.active(false); mute.emit('click', p.event('click')); assert.equal(p.video.muted, true);
  const silent = fixture({ volume: 0, muted: false }); silent.doc.emit('keydown', silent.event('m', { code: 'KeyM' }));
  assert.equal(silent.video.muted, false); assert.equal(silent.video.volume, 1); p.ui.destroy(); silent.ui.destroy();
});

test('scrub timestamps and accessibility describe the pending position without seeking or pausing media', () => {
  const p = fixture(), [seek] = p.progress.children, clock = p.icons['.art-control-time'];
  p.video.paused = false; seek.value = '750'; seek.emit('input');
  assert.equal(p.video.currentTime, 20); assert.equal(p.video.paused, false); assert.equal(clock.textContent, '01:30 / 02:00');
  assert.equal(clock.attrs.get('data-current-time'), '1:30'); assert.match(seek.attrs.get('aria-valuetext'), /松开后跳转到 1:30/);
  p.video.currentTime = 21; p.video.emit('timeupdate'); assert.equal(clock.textContent, '01:30 / 02:00'); assert.equal(seek.value, '750');
  assert.deepEqual(p.instance().emissions.at(-1), ['setBar', 'played', .75]);
  seek.emit('change'); assert.equal(p.video.currentTime, 90); assert.equal(p.video.paused, false); assert.equal(seek.attrs.get('aria-valuetext'), '1:30 / 2:00');
  p.ui.destroy();
});

test('cancelled scrubs restore the actual clock and progress through Escape, background, focus and geometry changes', () => {
  for (const action of ['Escape', 'blur', 'pointercancel', 'windowBlur', 'hidden', 'resize', 'fullscreen', 'loadstart', 'emptied']) {
    const p = fixture(), [seek, preview] = p.progress.children, clock = p.icons['.art-control-time'];
    let seeks = 0; Object.defineProperty(p.video, 'currentTime', { get: () => 20, set() { seeks++; } });
    seek.value = '750'; seek.emit('input');
    if (action === 'Escape') { p.doc.fullscreenElement = p.screen; const e = p.event('Escape'); seek.emit('keydown', e); assert.equal(e.prevented, true); assert.equal(p.fullscreens(), 0); }
    else if (action === 'windowBlur') p.doc.defaultView.emit('blur');
    else if (action === 'hidden') { p.doc.hidden = true; p.doc.emit('visibilitychange'); }
    else if (action === 'resize') p.doc.defaultView.emit('resize');
    else if (action === 'fullscreen') p.doc.emit('fullscreenchange');
    else if (['loadstart', 'emptied'].includes(action)) p.video.emit(action);
    else seek.emit(action);
    assert.equal(clock.textContent, '00:20 / 02:00'); assert.equal(clock.attrs.get('data-current-time'), '0:20'); assert.equal(preview.hidden, true);
    assert.equal(p.video.currentTime, 20); assert.equal(p.video.paused, true); assert.equal(seek.attrs.get('aria-valuetext'), '0:20 / 2:00');
    seek.value = '750'; seek.emit('change'); assert.equal(seeks, 0, 'release after cancellation must not seek');
    seek.value = '500'; seek.emit('input'); seek.emit('change'); assert.equal(seeks, 1, 'a new drag remains usable'); p.ui.destroy();
  }
  const p = fixture(), [seek] = p.progress.children; seek.value = '750'; seek.emit('input');
  p.doc.hidden = false; p.doc.emit('visibilitychange'); assert.match(seek.attrs.get('aria-valuetext'), /松开后/);
  seek.emit('keydown', p.event('Escape', { ctrlKey: true })); assert.match(seek.attrs.get('aria-valuetext'), /松开后/); p.ui.destroy();
});

test('rate-menu height follows player geometry without changing playback rate or position', () => {
  const p = fixture({ withQuality: true }), host = p.right.children[0];
  assert.equal(host.style['--player-menu-height'], '360px'); p.screen.clientHeight = 190; p.doc.defaultView.emit('resize');
  assert.equal(host.style['--player-menu-height'], '118px'); p.screen.clientHeight = 800; p.doc.emit('fullscreenchange');
  assert.equal(host.style['--player-menu-height'], '728px'); p.screen.clientHeight = 140; p.video.emit('resize');
  assert.equal(host.style['--player-menu-height'], '80px'); assert.equal(p.video.playbackRate, 1.25); assert.equal(p.video.currentTime, 20); p.ui.destroy();
});

test('keyboard seek feedback reports actual clamped movement and never changes pause or source', () => {
  const p = fixture(); p.instance().notice = {};
  assert.equal(p.ui.seekBy(10), true); assert.equal(p.video.currentTime, 30);
  assert.equal(p.instance().notice.show, '快进 10 秒 · 0:30');
  p.ui.seekBy(-60); assert.equal(p.instance().notice.show, '后退 30 秒 · 0:00');
  p.ui.seekBy(-10); assert.equal(p.instance().notice.show, '已到开头 · 0:00');
  p.video.currentTime = 115; p.ui.seekBy(10); assert.equal(p.instance().notice.show, '快进 5 秒 · 2:00');
  p.ui.seekBy(10); assert.equal(p.instance().notice.show, '已到片尾 · 2:00');
  assert.equal(p.video.paused, true); assert.equal(p.video.src, 'blob:existing-hls');
  p.active(false); assert.equal(p.ui.seekBy(10), false); p.active(true);
  assert.equal(p.ui.seekBy(NaN), false); p.video.duration = Infinity; assert.equal(p.ui.seekBy(10), false);
  p.ui.finish(); p.ui.destroy(); assert.equal(p.ui.seekBy(10), false);
});

test('failed keyboard seeking is handled once and progress keys show feedback without starting a frame job', () => {
  const p = fixture({ previews: true }); p.instance().notice = {};
  const seek = p.progress.children[2]; seek.emit('keydown', p.event('ArrowRight'));
  assert.equal(p.instance().notice.show, '快进 10 秒 · 0:30'); assert.equal(p.progress.children[0].hidden, true);
  Object.defineProperty(p.video, 'currentTime', { get: () => 30, set() { throw Error('private stream token'); } });
  assert.equal(p.ui.seekBy(10), true); assert.equal(p.errors.length, 1); assert.doesNotMatch(p.errors[0], /private/);
  p.ui.destroy();
});

test('double-click uses the same fullscreen entry and retains the original playback state', () => {
  const p = fixture(); assert.equal(p.Artplayer.DBCLICK_FULLSCREEN, false);
  for (const paused of [true, false]) {
    p.video.paused = paused; p.instance().emit('click'); p.video.paused = !paused; p.instance().emit('dblclick', {});
    assert.equal(p.video.paused, paused); assert.equal(p.video.currentTime, 20);
  }
  assert.equal(p.fullscreens(), 2);
  p.active(false); p.instance().emit('dblclick'); assert.equal(p.fullscreens(), 2);
  p.active(true); p.video.readyState = 0; p.instance().emit('dblclick'); assert.equal(p.fullscreens(), 2);
  p.video.readyState = 4; p.video.paused = true; p.instance().emit('click'); p.video.emit('loadstart'); p.video.paused = false;
  p.instance().emit('dblclick'); assert.equal(p.video.paused, false, 'old media state must not pause a new episode');
});

test('frame UI degrades safely to time-only for a blocked source and clamps near progress edges', () => {
  const p = fixture({ previews: true }), [image, caption, seek, time] = p.progress.children;
  seek.emit('pointermove', { clientX: 290 }); assert.equal(time.hidden, false); assert.equal(image.hidden, true); assert.equal(caption.hidden, true);
  assert.equal(image.style.left, '100px'); assert.equal(p.video.currentTime, 20);
  seek.emit('pointerleave'); assert.equal(time.hidden, true); p.ui.destroy();
});

test('ArtPlayer reuses the original media and delegates source, resume, shortcuts and recovery to the site', () => {
  const p = fixture(), options = p.options();
  assert.equal(options.url, ''); assert.equal(options.proxy(), p.video);
  assert.equal(options.theme, 'var(--cinema-accent)', 'the vendor inline theme must retain the dark control dock palette in light mode');
  for (const key of ['autoplay', 'autoPlayback', 'hotkey', 'mutex', 'fullscreen', 'fullscreenWeb', 'screenshot', 'pip', 'setting']) assert.equal(options[key], false);
  assert.equal(p.Artplayer.RECONNECT_TIME_MAX, 0); assert.equal(p.Artplayer.CONTEXTMENU, false); assert.equal(p.Artplayer.REMOVE_SRC_WHEN_DESTROY, false);
  assert.deepEqual([p.video.src, p.video.currentTime, p.video.paused, p.video.volume, p.video.muted, p.video.playbackRate], ['blob:existing-hls', 20, true, .4, true, 1.25]);
  assert.equal(p.controls.hidden, true); assert.ok(p.screen.classes.has('artplayer-active'));
  assert.deepEqual(p.instance().removed, ['video:error']); p.instance().emit('video:error'); assert.equal(p.instance().loading.show, false); assert.equal(p.instance().controls.show, true);
});

test('missing library leaves native controls intact; failed initialization restores media and gives a safe fallback message', () => {
  assert.equal(createArtPlayer(undefined), null);
  const p = fixture({ fail: true }); assert.equal(p.ui, null); assert.equal(p.video.parentElement, p.screen); assert.equal(p.screen.children[0], p.video);
  assert.equal(p.video.controls, true); assert.equal(p.video.className, 'original'); assert.equal(p.video.volume, .4);
  assert.equal(p.errors.length, 1); assert.doesNotMatch(p.errors[0], /private/);
  assert.equal(createArtPlayer(p.video, { screen: p.screen, controls: p.controls }), null);
});

test('hover only previews time; scrubbing seeks on release and blur, source change and resize clear previews', () => {
  const p = fixture(), [seek, preview] = p.progress.children;
  seek.emit('pointermove', { clientX: 200 }); assert.equal(preview.hidden, false); assert.equal(preview.textContent, '1:00'); assert.equal(p.video.currentTime, 20);
  seek.emit('pointerleave'); assert.equal(preview.hidden, true);
  seek.emit('pointermove', { clientX: 200, pointerType: 'touch' }); assert.equal(preview.hidden, true);
  seek.value = '750'; seek.emit('input'); p.video.emit('timeupdate'); assert.equal(seek.value, '750'); assert.equal(p.video.currentTime, 20);
  seek.emit('change'); assert.equal(p.video.currentTime, 90); assert.equal(p.video.paused, true);
  for (const type of ['blur', 'pointercancel']) { seek.value = '100'; seek.emit('input'); seek.emit(type); assert.equal(preview.hidden, true); assert.equal(p.video.currentTime, 90); }
  seek.emit('pointermove', { clientX: -100 }); assert.equal(preview.style.left, '32px');
  p.doc.defaultView.emit('resize'); assert.equal(preview.hidden, true);
  seek.emit('pointermove', { clientX: 500 }); assert.equal(preview.style.left, '168px'); p.video.duration = NaN; p.video.emit('loadstart'); assert.equal(preview.hidden, true); assert.equal(seek.disabled, true);
});

test('progress keyboard keeps ten-second steps, clamps bounds and preserves unrelated keys', () => {
  const p = fixture(), seek = p.progress.children[0];
  for (const [key, expected] of [['ArrowRight', 30], ['ArrowLeft', 20], ['PageUp', 80], ['PageDown', 20], ['End', 120], ['ArrowRight', 120], ['Home', 0], ['ArrowLeft', 0]]) { const e = p.event(key); seek.emit('keydown', e); assert.equal(p.video.currentTime, expected); assert.equal(e.prevented, true); }
  for (const e of [p.event('Tab'), p.event('ArrowRight', { ctrlKey: true }), p.event('ArrowRight', { altKey: true }), p.event('ArrowRight', { metaKey: true })]) { seek.emit('keydown', e); assert.equal(e.prevented, false); }
  for (const type of ['mousedown', 'touchstart', 'click']) { const e = p.event(''); seek.emit(type, e); assert.equal(e.stopped, true); }
  Object.defineProperty(p.video, 'currentTime', { get: () => 20, set() { throw Error('upstream secret'); } }); seek.value = '500'; seek.emit('change'); assert.equal(p.video.currentTime, 20); assert.equal(p.errors.length, 1);
  assert.equal(p.icons['.art-control-time'].textContent, '00:20 / 02:00'); assert.equal(seek.attrs.get('aria-valuetext'), '0:20 / 2:00');
});

test('speed, fullscreen, volume keyboard and icon keyboard remain usable and synchronized', () => {
  const p = fixture(), speed = p.right.children[0].children[0], full = p.right.children[1];
  speed.value = '1.5'; speed.emit('change'); assert.equal(p.video.playbackRate, 1.5); p.video.playbackRate = 2; p.video.emit('ratechange'); assert.equal(speed.value, '2');
  full.emit('click'); assert.equal(p.fullscreens(), 1); p.doc.fullscreenElement = p.screen; p.doc.emit('fullscreenchange'); assert.equal(full.attrs.get('aria-label'), '退出全屏');
  p.doc.emit('keydown', p.event('Escape', { defaultPrevented: true })); assert.equal(p.fullscreens(), 1);
  p.doc.emit('keydown', p.event('Escape')); assert.equal(p.fullscreens(), 2);
  const slider = p.icons['.art-volume-slider']; assert.equal(slider.attrs.get('role'), 'slider');
  slider.emit('keydown', p.event('ArrowUp')); assert.equal(Math.round(p.video.volume * 100), 45); assert.equal(p.video.muted, false);
  slider.emit('keydown', p.event('Home')); assert.equal(p.video.volume, 0); assert.equal(p.video.muted, true);
  slider.emit('keydown', p.event('End')); assert.equal(p.video.volume, 1); assert.equal(p.video.muted, false);
  const e = p.event('ArrowDown', { ctrlKey: true }); slider.emit('keydown', e); assert.equal(e.prevented, false);
  const play = p.icons['.art-control-playAndPause'];
  play.emit('keydown', p.event('Enter')); assert.equal(p.video.paused, false); assert.equal(play.attrs.get('aria-label'), '暂停');
  play.emit('keydown', p.event(' ')); play.emit('keydown', p.event('Tab')); assert.equal(p.video.paused, true); assert.equal(play.attrs.get('aria-label'), '播放');
  p.icons['.art-icon-volume'].emit('keydown', p.event('Enter')); assert.equal(p.video.muted, true); assert.equal(p.video.volume, 1);
  p.player.emit('focusin'); assert.equal(p.instance().controls.show, true); p.instance().controls.show = false; p.video.emit('waiting'); assert.equal(p.instance().controls.show, true);
});

test('keyboard play and speed errors remain localized and unavailable media disables progress', async () => {
  const p = fixture({ duration: Infinity }), play = p.icons['.art-control-playAndPause'];
  p.video.play = () => Promise.reject(Error('private token')); play.emit('keydown', p.event(' ')); await Promise.resolve(); assert.equal(p.errors.length, 1); assert.doesNotMatch(p.errors[0], /private/);
  const speed = p.right.children[0].children[0]; Object.defineProperty(p.video, 'playbackRate', { get: () => 1, set() { throw Error('unavailable'); } }); speed.value = '2'; speed.emit('change'); assert.equal(p.errors.length, 2);
  const seek = p.progress.children[0], event = p.event('ArrowRight'); seek.emit('keydown', event); assert.equal(event.prevented, false); assert.equal(seek.disabled, true);
  seek.emit('change'); assert.equal(seek.disabled, true); assert.equal(seek.attrs.get('aria-valuetext'), '0:00 / --:--');
});

test('old source, disposed and cancelled keyboard play promises stay silent', async () => {
  for (const action of ['source', 'destroy', 'loadstart', 'AbortError', 'newer']) {
    const p = fixture(), play = p.icons['.art-control-playAndPause']; let reject;
    p.video.play = () => new Promise((_resolve, fail) => { reject = fail; }); play.emit('keydown', p.event(' ')); const staleReject = reject;
    if (action === 'source') p.video.src = 'next.mp4';
    if (action === 'destroy') p.ui.destroy();
    if (action === 'loadstart') p.video.emit('loadstart');
    if (action === 'newer') play.emit('keydown', p.event(' '));
    staleReject(Object.assign(Error('old failure'), { name: action === 'AbortError' ? 'AbortError' : 'Error' })); await Promise.resolve();
    assert.equal(p.errors.length, 0);
  }
});

test('destroy restores native fallback without losing media and removes listeners once, including sparse templates', () => {
  const p = fixture({ omitIcons: true }); p.ui.destroy(); p.ui.destroy(); p.ui.refresh();
  assert.equal(p.destroyed(), 1); assert.equal(p.video.parentElement, p.screen); assert.equal(p.screen.children[0], p.video);
  assert.equal(p.video.src, 'blob:existing-hls'); assert.equal(p.video.currentTime, 20); assert.equal(p.video.controls, true); assert.equal(p.video.className, 'original');
  assert.equal(p.screen.classes.has('artplayer-active'), false);
  assert.equal([...p.video.listeners.values()].every(group => group.size === 0), true);
  assert.equal([...p.doc.listeners.values()].every(group => group.size === 0), true);
});
