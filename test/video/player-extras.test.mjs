import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerExtras, createAutoNext, createPlayerRecovery } from '../../source/video/player-extras.js';

function fixture({ pipSupported = true, panel = true, navigation = true } = {}) {
  const doc = { activeElement: null, pictureInPictureEnabled: pipSupported, fullscreenElement: null };
  function node(tagName = 'DIV') {
    const listeners = new Map(), attrs = new Map(), classes = new Set();
    const element = { tagName: tagName.toUpperCase(), children: [], listeners, attrs, classes, hidden: false, disabled: false,
      tabIndex: ['button', 'summary', 'select'].includes(tagName) ? 0 : -1, ownerDocument: doc,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
      setAttribute: (name, value) => attrs.set(name, value), getAttribute: name => attrs.get(name),
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
      emit: (type, event = {}) => Promise.all([...(listeners.get(type) || [])].map(fn => fn(event))),
      append(...items) { items.forEach(item => { item.remove(); this.children.push(item); item.parentElement = this; }); },
      insertBefore(item, anchor) { item.remove(); const index = this.children.indexOf(anchor); this.children.splice(index < 0 ? this.children.length : index, 0, item); item.parentElement = this; },
      remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(item => item !== this); this.parentElement = null; },
      focus() { doc.activeElement = this; }, getClientRects: () => [{}], scrollIntoView() { this.scrolled = true; },
      contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      querySelector() { return null; },
      querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => ['BUTTON', 'SUMMARY', 'SELECT', 'A'].includes(child.tagName) || child.tabIndex >= 0); },
    };
    Object.defineProperty(element, 'nextSibling', { get() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1] || null; } });
    return element;
  }
  Object.assign(doc, node()); doc.ownerDocument = doc; doc.defaultView = node(); doc.createElement = node;
  const video = node('video'), screen = node(), left = node(), right = node(), episodePanel = node('aside'), layout = node(), sibling = node(), play = node(), current = node('button');
  const other = node('button'); episodePanel.append(current, other); episodePanel.querySelector = () => current;
  left.append(play); left.querySelector = () => play; layout.append(screen, episodePanel, sibling);
  Object.assign(video, { src: 'https://media.example/a.m3u8', readyState: 4, videoWidth: 1080, paused: false, currentTime: 42, volume: .6,
    requestPictureInPicture: async () => { entered++; doc.pictureInPictureElement = video; await video.emit('enterpictureinpicture'); } });
  doc.exitPictureInPicture = async () => { exited++; doc.pictureInPictureElement = null; await video.emit('leavepictureinpicture'); };
  let entered = 0, exited = 0, nextCount = 0, previews = 0, active = true; const errors = [], state = { count: 54, current: 0, label: '第01集 · 琅琊榜' };
  const ui = createPlayerExtras(video, { screen, right, left: navigation ? left : undefined, episodePanel: panel ? episodePanel : undefined,
    onNext: navigation ? () => nextCount++ : undefined, getEpisodeState: () => state, onError: message => errors.push(message), onPreviewHide: () => previews++, isActive: () => active });
  const byClass = (group, name) => group.children.find(child => child.className?.includes(name));
  const pip = byClass(right, 'art-site-pip'), episodes = byClass(right, 'art-site-episodes'), next = byClass(left, 'art-site-next');
  const open = async () => { episodes.focus(); await episodes.emit('click'); return screen.children.find(child => child.className === 'art-episode-dialog'); };
  const key = (value, extra = {}) => ({ key: value, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
  return { ui, video, doc, screen, left, right, episodePanel, layout, sibling, current, other, state, pip, episodes, next, errors, key, open, active: value => active = value, entered: () => entered, exited: () => exited, nextCount: () => nextCount, previews: () => previews };
}

function finishFixture() {
  const p = fixture({ panel: false, pipSupported: false, navigation: false });
  let time = 0, sequence = 0, next = 0, enabled = true;
  const jobs = new Map(); p.video.ended = true;
  const auto = createAutoNext(p.video, { screen: p.screen, getEpisodeState: () => p.state,
    getAutoNext: () => enabled, isActive: () => !p.inactive, onNext: () => next++, now: () => time,
    setTimer: fn => { jobs.set(++sequence, fn); return sequence; }, clearTimer: id => jobs.delete(id) });
  const card = () => p.screen.children.find(node => node.className === 'art-auto-next');
  return Object.assign(p, { auto, jobs, card, enabled: value => enabled = value, nextCount: () => next,
    advance(ms) { time += ms; const callbacks = [...jobs.values()]; jobs.clear(); callbacks.forEach(fn => fn()); } });
}

function recoveryFixture({ observer = true, choose = true, withNotice = false } = {}) {
  const p = fixture({ panel: false, navigation: false, pipSupported: false });
  let watched, selected = 0, retryCalls = 0, active = true, available = true, context = 'first:0';
  let time = 1000, timerId = 0; const timers = new Map();
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; watched = this; }
    observe(node, options) { this.targets.push([node, options]); }
    disconnect() { this.disconnected = true; }
  }
  if (observer) p.doc.defaultView.MutationObserver = Observer;
  const feedback = p.doc.createElement('div'), status = p.doc.createElement('p'), retry = p.doc.createElement('button'), back = p.doc.createElement('a'), sibling = p.doc.createElement('p');
  retry.textContent = '从当前位置重试'; retry.addEventListener('click', () => retryCalls++); feedback.append(retry, back); feedback.hidden = true;
  feedback.querySelector = selector => selector === '#retry-play' ? retry : null;
  p.layout.append(feedback, sibling); status.textContent = '这条线路暂时无法播放，观看位置已保留。';
  const notice = withNotice ? p.doc.createElement('p') : undefined; if (notice) notice.hidden = true;
  const ui = createPlayerRecovery({ screen: p.screen, feedback, status, notice, isActive: () => active,
    onChooseSource: choose ? () => selected++ : undefined, canChooseSource: () => available,
    getContext: () => context,
    now: () => time, setTimer: (fn, delay) => { timers.set(++timerId, { fn, due: time + delay }); return timerId; }, clearTimer: id => timers.delete(id) });
  return { ...p, ui, feedback, status, notice, retry, back, sibling, watcher: () => watched, active: value => active = value, available: value => available = value, context: value => context = value,
    selected: () => selected, retries: () => retryCalls, root: () => p.screen.children[0], source: () => feedback.children.find(node => node.className?.includes('art-recovery-source')),
    advance(ms) { time += ms; for (const [id, job] of [...timers]) if (job.due <= time) { timers.delete(id); job.fn(); } } };
}

test('recovery card reuses the existing retry and return actions, and stays absent during healthy playback', async () => {
  const p = recoveryFixture(); assert.equal(p.root().hidden, true); assert.equal(p.retries(), 0); assert.equal(p.selected(), 0);
  p.feedback.hidden = false; p.watcher().callback(); assert.equal(p.root().hidden, false); assert.equal(p.screen.classes.has('playback-recovery-open'), true);
  assert.equal(p.feedback.parentElement, p.root()); assert.equal(p.root().children[1].textContent, p.status.textContent);
  assert.equal(p.feedback.children[0], p.retry); assert.equal(p.feedback.children[2], p.back); assert.equal(p.watcher().targets.length, 3);
  await p.retry.emit('click'); assert.equal(p.retries(), 1); assert.equal(p.video.currentTime, 42);
  p.feedback.hidden = true; p.watcher().callback(); p.advance(400); assert.equal(p.root().hidden, true); assert.equal(p.screen.classes.has('playback-recovery-open'), false); p.ui.destroy();
});

test('recovery presents pending retry, source availability and safe fallback text without initiating actions', async () => {
  const p = recoveryFixture(); p.feedback.hidden = false; p.watcher().callback(); p.retry.disabled = true; p.status.textContent = ''; p.watcher().callback();
  assert.equal(p.retry.textContent, '正在重试…'); assert.match(p.root().children[1].textContent, /观看位置/);
  p.available(false); p.watcher().callback(); await p.source().emit('click'); assert.equal(p.selected(), 0);
  p.available(true); p.retry.disabled = false; p.watcher().callback(); await p.source().emit('click'); assert.equal(p.selected(), 1);
  assert.equal(p.retry.textContent, '从当前位置重试'); assert.equal(p.retries(), 0); p.ui.destroy();
});

test('retry actions remain in place through a rapid click burst so a second click cannot hit the video', async () => {
  const p = recoveryFixture(); p.feedback.hidden = false; p.watcher().callback(); await p.retry.emit('click');
  p.feedback.hidden = true; p.watcher().callback(); assert.equal(p.feedback.parentElement, p.root()); assert.equal(p.root().hidden, false);
  assert.equal(p.root().classes.has('is-retrying'), true); assert.equal(p.retry.textContent, '正在重试…');
  p.advance(399); assert.equal(p.root().hidden, false);
  p.advance(1); assert.equal(p.root().hidden, true); assert.equal(p.feedback.parentElement, p.layout); p.ui.destroy();
});

test('a new episode clears the old retry presentation, and holding Enter cannot repeatedly submit retry', async () => {
  const p = recoveryFixture(); p.feedback.hidden = false; p.watcher().callback(); await p.retry.emit('click');
  const event = p.key('Enter', { repeat: true }); await p.retry.emit('keydown', event); assert.equal(event.prevented, true);
  const space = p.key(' ', { repeat: true }); await p.retry.emit('keydown', space); assert.equal(space.prevented, undefined);
  p.retry.disabled = true; p.feedback.hidden = true; p.context('next:1'); p.watcher().callback();
  assert.equal(p.root().hidden, true); assert.equal(p.feedback.parentElement, p.layout); assert.equal(p.screen.classes.has('playback-recovery-open'), false); p.ui.destroy();
});

test('leaving watch or successful recovery hides the card and restores focus without changing media', async () => {
  const p = recoveryFixture(); p.feedback.hidden = false; p.watcher().callback(); p.retry.focus();
  p.active(false); await p.doc.defaultView.emit('hashchange'); assert.equal(p.root().hidden, true); assert.equal(p.doc.activeElement, p.screen);
  await p.source().emit('click'); assert.equal(p.selected(), 0);
  p.active(true); await p.doc.defaultView.emit('hashchange'); p.retry.focus(); p.feedback.hidden = true; p.watcher().callback();
  assert.equal(p.doc.activeElement, p.screen); assert.equal(p.video.currentTime, 42); assert.equal(p.video.paused, false); p.ui.destroy();
});

test('a buffered offline video keeps its picture unobstructed and recovery actions outside the player', async () => {
  const p = recoveryFixture({ withNotice: true }); p.feedback.hidden = false; p.watcher().callback();
  assert.equal(p.root().hidden, true); assert.equal(p.feedback.parentElement, p.layout); assert.equal(p.video.paused, false);
  await p.source().emit('click'); assert.equal(p.selected(), 1);
  p.notice.hidden = false; p.watcher().callback(); assert.equal(p.root().hidden, false); assert.equal(p.feedback.parentElement, p.root());
  p.notice.hidden = true; p.watcher().callback(); assert.equal(p.feedback.parentElement, p.layout); assert.equal(p.feedback.nextSibling, p.sibling); p.ui.destroy();
});

test('recovery teardown removes observers and source listeners while restoring original actions and placement', async () => {
  const p = recoveryFixture(); p.feedback.hidden = false; p.watcher().callback(); const source = p.source(); source.focus();
  p.ui.destroy(); p.ui.destroy(); p.ui.refresh(); p.watcher().callback();
  assert.equal(p.feedback.parentElement, p.layout); assert.equal(p.feedback.nextSibling, p.sibling); assert.equal(p.watcher().disconnected, true);
  assert.equal(p.retry.textContent, '从当前位置重试'); assert.equal(p.doc.activeElement, p.screen); assert.equal(p.screen.children.length, 0);
  await source.emit('click'); assert.equal(p.selected(), 0); await p.retry.emit('click'); assert.equal(p.retries(), 1);
  const missing = recoveryFixture({ observer: false }); assert.equal(missing.ui, null); assert.equal(missing.feedback.parentElement, missing.layout);
  assert.equal(createPlayerRecovery(), null);
  const noSource = recoveryFixture({ choose: false }); assert.equal(noSource.source(), undefined); noSource.sibling.remove(); noSource.ui.destroy(); assert.equal(noSource.feedback.parentElement, noSource.layout);
});

test('source recovery opens the cached drawer at source choices without playback or requests', async () => {
  const p = fixture(), sources = p.doc.createElement('details'), toggle = p.doc.createElement('summary'); sources.append(toggle); p.episodePanel.append(sources);
  p.episodePanel.querySelector = selector => selector === '#watch-sources' ? sources : selector === '#watch-sources-toggle' ? toggle : p.current;
  p.ui.open({ sources: true }); assert.equal(sources.open, true); assert.equal(p.doc.activeElement, toggle); assert.equal(p.nextCount(), 0);
  assert.equal(p.video.currentTime, 42); assert.equal(p.current.scrolled, undefined); p.ui.close();
  p.active(false); p.ui.open(); assert.equal(p.screen.children.length, 0); p.active(true); p.state.count = 0; p.ui.refresh(); p.ui.open(); assert.equal(p.screen.children.length, 0);
  p.ui.destroy(); p.ui.open(); assert.equal(p.screen.children.length, 0);
  const empty = fixture({ panel: false }); empty.ui.open({ sources: true }); assert.equal(empty.screen.children.length, 0); empty.ui.destroy();
});

test('auto-next waits five seconds without touching media, can play immediately and fires only once', async () => {
  assert.equal(createAutoNext(null), null);
  const p = finishFixture(); p.state.nextLabel = '第2集'; p.auto.start();
  assert.equal(p.card().children[0].textContent, '5 秒后播放下一集');
  assert.equal(p.card().children[1].textContent, '第2集'); assert.equal(p.video.currentTime, 42); assert.equal(p.nextCount(), 0);
  p.advance(4000); assert.equal(p.card().children[0].textContent, '1 秒后播放下一集');
  p.advance(1000); assert.equal(p.nextCount(), 1); assert.equal(p.card(), undefined); assert.equal(p.jobs.size, 0);
  p.advance(10000); assert.equal(p.nextCount(), 1);
  p.auto.start(); const next = p.card().children[2].children[0]; await next.emit('click'); await next.emit('click');
  assert.equal(p.nextCount(), 2); assert.equal(p.jobs.size, 0);
});

test('cancelling, replay, seeking, source changes, navigation and backgrounding stop pending auto-next', async () => {
  for (const action of ['cancel', 'Escape', 'play', 'seeking', 'loadstart', 'emptied', 'error', 'hashchange', 'visibilitychange', 'destroy']) {
    const p = finishFixture(); p.auto.start();
    if (action === 'cancel') await p.card().children[2].children[1].emit('click');
    else if (action === 'Escape') { const event = p.key('Escape'); await p.doc.emit('keydown', event); assert.equal(event.prevented, true); }
    else if (action === 'hashchange') await p.doc.defaultView.emit(action);
    else if (action === 'visibilitychange') { p.doc.hidden = true; await p.doc.emit(action); }
    else if (action === 'destroy') { p.auto.destroy(); p.auto.destroy(); }
    else await p.video.emit(action);
    p.advance(10000); assert.equal(p.nextCount(), 0, action); assert.equal(p.card(), undefined, action); assert.equal(p.jobs.size, 0);
    p.auto.destroy();
  }
});

test('timer rechecks episode identity, preferences, media and next availability before advancing', () => {
  for (const change of [p => p.state.current++, p => p.state.key = 'another-line', p => p.video.src = 'next-source',
    p => p.state.count = 1, p => p.state.current = -1, p => p.state.loading = true, p => p.state.switching = true, p => p.enabled(false),
    p => p.video.ended = false, p => p.doc.hidden = true, p => p.inactive = true]) {
    const p = finishFixture(); p.auto.start(); change(p); p.advance(5000);
    assert.equal(p.nextCount(), 0); assert.equal(p.card(), undefined);
    p.auto.destroy();
  }
});

test('restarting a countdown replaces its timer and respects menu Escape and keyboard focus', async () => {
  const p = finishFixture(); p.auto.start(); p.advance(2000); p.auto.start(); assert.equal(p.jobs.size, 1);
  p.advance(3000); assert.equal(p.card().children[0].textContent, '2 秒后播放下一集');
  for (const extra of [{ defaultPrevented: true }, { ctrlKey: true }, { isComposing: true }, { target: { closest: () => true } }]) {
    await p.doc.emit('keydown', p.key('Escape', extra)); assert.ok(p.card());
  }
  p.card().contains = node => node === p.card().children[2].children[1];
  p.card().children[2].children[1].focus(); p.auto.cancel(); assert.equal(p.doc.activeElement, p.screen);
  p.auto.destroy(); p.auto.start(); assert.equal(p.card(), undefined);
});

test('disabled auto-next, movie endings and unavailable next episodes never show a countdown', () => {
  for (const change of [p => p.state.count = 1, p => p.state.current = -1, p => p.state.current = p.state.count - 1,
    p => p.state.loading = true, p => p.state.switching = true, p => p.enabled(false), p => p.video.ended = false, p => p.doc.hidden = true, p => p.inactive = true]) {
    const p = finishFixture(); change(p); p.auto.start(); assert.equal(p.card(), undefined); assert.equal(p.jobs.size, 0); p.auto.destroy();
  }
});

test('PiP uses the original video, toggles its label and preserves playback state', async () => {
  assert.equal(createPlayerExtras(null), null);
  const p = fixture(); await p.pip.emit('click'); assert.equal(p.entered(), 1); assert.equal(p.pip.attrs.get('aria-label'), '退出画中画');
  await p.pip.emit('click'); assert.equal(p.exited(), 1); assert.equal(p.pip.attrs.get('aria-pressed'), 'false');
  assert.deepEqual([p.video.currentTime, p.video.paused, p.video.volume], [42, false, .6]);
  p.video.readyState = 0; p.ui.refresh(); assert.equal(p.pip.disabled, true); await p.pip.emit('click'); assert.equal(p.entered(), 1);
  p.video.readyState = 4; p.video.disablePictureInPicture = true; p.ui.refresh(); assert.equal(p.pip.disabled, true);
  assert.equal(fixture({ pipSupported: false }).pip, undefined);
});

test('PiP failures are neutral; duplicate, cancelled, old-source and destroyed requests stay quiet', async () => {
  const p = fixture(); let reject;
  p.video.requestPictureInPicture = () => new Promise((_resolve, fail) => reject = fail);
  const first = p.pip.emit('click'); await p.pip.emit('click'); assert.equal(p.pip.disabled, true);
  reject(Error('private source error')); await first; assert.equal(p.errors.length, 1); assert.equal(p.errors[0].includes('private'), false);
  for (const action of [() => p.video.emit('loadstart'), () => p.video.src = 'https://media.example/b.m3u8', () => {}, () => p.ui.destroy()]) {
    const pending = p.pip.emit('click'); await action(); reject(Object.assign(Error('obsolete'), { name: action.toString().includes('() => {}') ? 'AbortError' : 'Error' })); await pending;
    assert.equal(p.errors.length, 1);
  }
});

test('drawer reuses the same episode nodes, adds no playback action, and restores location and focus', async () => {
  const p = fixture(), dialog = await p.open();
  assert.equal(p.episodePanel.parentElement, dialog); assert.equal(dialog.attrs.get('aria-modal'), 'true'); assert.equal(p.previews(), 1); assert.equal(p.nextCount(), 0);
  assert.equal(p.current.scrolled, true); assert.equal(p.doc.activeElement.attrs.get('aria-label'), '关闭选集面板');
  assert.equal(p.episodes.attrs.get('aria-expanded'), 'true'); assert.equal(p.video.currentTime, 42);
  const e = p.key('Escape'); await dialog.emit('keydown', e); assert.equal(e.prevented, true); assert.equal(e.stopped, true);
  assert.equal(p.doc.activeElement, p.episodes); assert.equal(p.episodePanel.parentElement, p.layout); assert.equal(p.episodePanel.nextSibling, p.sibling); assert.equal(p.screen.children.length, 0);
  for (let i = 0; i < 4; i++) { await p.open(); await p.screen.children[0].emit('click'); }
  assert.equal(p.right.children.length, 2, 'reopening does not accumulate controls');
});

test('drawer traps Tab, preserves episode key handlers, and closes before selection or media changes', async () => {
  const p = fixture(), dialog = await p.open(), dismiss = p.doc.activeElement;
  let e = p.key('Tab', { shiftKey: true }); await dialog.emit('keydown', e); assert.equal(p.doc.activeElement, p.other); assert.equal(e.prevented, true);
  e = p.key('Tab'); await dialog.emit('keydown', e); assert.equal(p.doc.activeElement, dismiss);
  e = p.key('ArrowRight'); await dialog.emit('keydown', e); assert.equal(e.stopped, true); assert.equal(e.prevented, undefined);
  await p.episodePanel.emit('click', { target: { closest: () => p.current } }); assert.equal(p.episodePanel.parentElement, p.layout);
  await p.open(); p.state.label = '第02集'; p.ui.refresh(); assert.equal(p.screen.children[1].children[0].children[0].textContent, '第02集');
  await p.video.emit('emptied'); assert.equal(p.screen.children.length, 0);
  await p.open(); await p.doc.emit('fullscreenchange'); assert.equal(p.screen.children.length, 0);
  await p.open(); await p.doc.defaultView.emit('resize'); assert.equal(p.screen.children.length, 0);
  const empty = await p.open(); empty.querySelectorAll = () => []; e = p.key('Tab'); await empty.emit('keydown', e); assert.equal(p.doc.activeElement, empty);
});

test('movies, first/last episodes and loading states keep navigation accurate', async () => {
  const p = fixture(); await p.next.emit('click'); assert.equal(p.nextCount(), 1);
  p.state.current = 53; p.ui.refresh(); assert.equal(p.next.disabled, true); await p.next.emit('click'); assert.equal(p.nextCount(), 1);
  p.state.current = -1; p.ui.refresh(); assert.equal(p.next.disabled, true);
  p.state.count = 1; p.ui.refresh(); assert.equal(p.next.hidden, true); assert.equal(p.episodes.textContent, '来源');
  p.state.loading = true; p.ui.refresh(); await p.episodes.emit('click'); assert.equal(p.screen.children.length, 0);
  p.state.count = 0; p.state.loading = false; p.ui.refresh(); assert.equal(p.episodes.disabled, true);
  const minimal = fixture({ panel: false, navigation: false, pipSupported: false }); assert.equal(minimal.right.children.length, 0); minimal.ui.destroy();
});

test('destroy restores the panel even if its previous sibling disappeared and removes every persistent listener', async () => {
  const p = fixture(); await p.open(); p.sibling.remove(); p.ui.destroy(); p.ui.destroy();
  assert.equal(p.episodePanel.parentElement, p.layout); assert.equal(p.right.children.length, 0); assert.equal(p.left.children.length, 1);
  for (const node of [p.video, p.doc, p.doc.defaultView, p.episodePanel, p.pip, p.episodes, p.next]) assert.ok([...node.listeners.values()].every(items => items.size === 0));
  await p.pip.emit('click'); assert.equal(p.entered(), 0);
});

test('leaving watch closes PiP and an entering request cannot leave a stale floating window', async () => {
  const p = fixture(); await p.pip.emit('click'); p.active(false); await p.doc.defaultView.emit('hashchange'); assert.equal(p.exited(), 1);
  const delayed = fixture(); let resolve;
  delayed.video.requestPictureInPicture = () => new Promise(done => resolve = () => { delayed.doc.pictureInPictureElement = delayed.video; done(); });
  const pending = delayed.pip.emit('click'); delayed.active(false); await delayed.doc.defaultView.emit('hashchange'); resolve(); await pending;
  assert.equal(delayed.exited(), 1); assert.equal(delayed.errors.length, 0);
  const destroyed = fixture(); await destroyed.pip.emit('click'); destroyed.ui.destroy(); assert.equal(destroyed.exited(), 1);
});

test('E opens cached episodes and leaves modified keys, typing, menus and inactive pages untouched', async () => {
  const p = fixture();
  for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }, { defaultPrevented: true },
    { target: { tagName: 'INPUT' } }, { target: { isContentEditable: true } }, { target: { closest: () => true } }]) {
    await p.doc.emit('keydown', p.key('e', { code: 'KeyE', ...extra })); assert.equal(p.screen.children.length, 0);
  }
  p.active(false); await p.doc.emit('keydown', p.key('e', { code: 'KeyE' })); assert.equal(p.screen.children.length, 0);
  p.active(true); const e = p.key('e', { code: 'KeyE' }); await p.doc.emit('keydown', e); assert.equal(e.prevented, true); assert.equal(p.nextCount(), 0);
  await p.doc.emit('keydown', p.key('e', { code: 'KeyE' })); assert.equal(p.screen.children.length, 2, 'a second request does not duplicate the drawer');
  p.ui.destroy();
});
