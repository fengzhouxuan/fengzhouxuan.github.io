import test from 'node:test';
import assert from 'node:assert/strict';
import { createRatePicker, createQualityPicker } from '../../source/video/player-controls.js';

function fixture({ disabled = false, hidden = false, label } = {}) {
  const document = { activeElement: null, defaultView: { Event }, listeners: new Map() };
  const elements = [];
  function element() {
    const attributes = new Map(), classes = new Set(), listeners = new Map();
    const node = { ownerDocument: document, attributes, classes, listeners, children: [], dataset: {}, hidden: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } },
      setAttribute: (name, value) => attributes.set(name, value), getAttribute: name => attributes.get(name),
      append(...children) { children.forEach(child => { if (child.parentElement) child.remove(); this.children.push(child); child.parentElement = this; }); },
      insertBefore(child, anchor) { if (child.parentElement) child.remove(); const index = this.children.indexOf(anchor); this.children.splice(index < 0 ? this.children.length : index, 0, child); child.parentElement = this; },
      querySelector(selector) { const name = selector.slice(1); for (const child of this.children) { if (child.className?.split(' ').includes(name)) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; },
      remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); },
      contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      focus(options) { assert.deepEqual(options, { preventScroll: true }); document.activeElement = this; },
      addEventListener(type, handler) { const group = listeners.get(type) || new Set(); group.add(handler); listeners.set(type, group); },
      removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
      emit(type, event = {}) { for (const handler of listeners.get(type) || []) handler(event); },
      dispatchEvent(event) { this.emit(event.type, event); },
    };
    Object.defineProperty(node, 'nextSibling', { get() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1] || null; } });
    elements.push(node); return node;
  }
  const owner = element(); document.listeners = owner.listeners;
  document.addEventListener = owner.addEventListener; document.removeEventListener = owner.removeEventListener;
  document.emit = owner.emit; document.createElement = element;
  const root = element(), select = element(); select.id = 'speed'; select.hidden = hidden; select.disabled = disabled; select.value = '1';
  select.setAttribute('aria-label', '播放倍速');
  select.options = ['0.75', '1', '1.25', '1.5', '2'].map(value => ({ value, textContent: value + '×' })); root.append(select);
  const picker = createRatePicker(select, { label });
  const trigger = root.children[1], menu = root.children[2], choices = menu.children;
  let changes = 0; select.addEventListener('change', () => { changes++; });
  function key(target, key) {
    let prevented = false, stopped = false;
    target.emit('keydown', { key, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    return { prevented, stopped };
  }
  return { document, elements, root, select, picker, trigger, menu, choices, key, changes: () => changes };
}

function qualityFixture({ hidden = false } = {}) {
  const p = fixture({ hidden }); p.picker.destroy();
  const container = p.document.createElement('div'), focusTarget = p.document.createElement('div'), sibling = p.document.createElement('span');
  container.style = { setProperty(name, value) { this[name] = value; } };
  p.root.append(sibling); p.select.id = 'quality-select'; p.select.setAttribute('aria-label', '视频清晰度');
  p.select.options = [{ value: '-1', textContent: '自动' }, { value: '2', textContent: '1080p' }, { value: '0', textContent: '360p' }];
  p.select.value = '-1';
  const summary = { selectable: true, displayLabel: '360p', currentLabel: '当前画面：360p · 640×360', note: '自动根据网络情况选择清晰度。' };
  const picker = createQualityPicker(p.select, { container, focusTarget }); picker.refresh(summary);
  return { ...p, picker, container, focusTarget, sibling, summary,
    trigger: () => container.querySelector('.choice-trigger'), menu: () => container.querySelector('.choice-menu'), badge: () => container.querySelector('.art-quality-current') };
}

test('quality menus use the original model and commit once without adding media actions', () => {
  const p = qualityFixture(); assert.equal(p.select.parentElement, p.container); assert.equal(p.select.hidden, true);
  assert.equal(p.trigger().attributes.get('aria-label'), '视频清晰度：自动'); assert.equal(p.badge().hidden, true);
  assert.equal(p.menu().children.length, 4); assert.match(p.menu().children[3].textContent, /360p/);
  p.trigger().emit('click'); const menu = p.menu(); p.menu().children[1].emit('click');
  assert.equal(p.select.value, '2'); assert.equal(p.changes(), 1); assert.equal(menu.hidden, true);
  assert.equal(p.document.activeElement, p.trigger()); p.picker.destroy();
  assert.equal(createQualityPicker(null), null); assert.equal(createQualityPicker(p.select), null);
});

test('level events update current information and selection without rebuilding or closing the open menu', () => {
  const p = qualityFixture(); p.trigger().emit('click'); const menu = p.menu(), trigger = p.trigger();
  p.select.value = '2'; p.picker.refresh({ ...p.summary, displayLabel: '1080p', note: '继续播放后切换。' });
  p.picker.refresh(); assert.equal(p.container.style['--player-menu-height'], '360px');
  assert.equal(p.menu(), menu); assert.equal(p.trigger(), trigger); assert.equal(menu.hidden, false);
  assert.equal(menu.children[1].attributes.get('aria-checked'), 'true'); assert.match(menu.children[3].textContent, /继续播放后切换/);
  assert.equal(p.changes(), 0); p.picker.destroy();
});

test('changed level lists replace stale options and retain keyboard focus at the new trigger', () => {
  const p = qualityFixture(); p.trigger().emit('click'); const old = p.menu();
  p.select.options = [{ value: '-1', textContent: '自动' }, { value: '0', textContent: '720p' }]; p.select.value = '-1'; p.picker.refresh(p.summary);
  assert.notEqual(p.menu(), old); assert.equal(p.menu().children.length, 3); assert.equal(p.document.activeElement, p.trigger());
  assert.equal(p.menu().children[1].textContent, '720p'); assert.equal(p.changes(), 0);
  for (const node of [old, ...old.children]) for (const group of node.listeners.values()) assert.equal(group.size, 0);
  p.picker.destroy();
});

test('single, native, loading and disabled states show actual information without invented choices', () => {
  for (const mode of ['single', 'native', 'loading', 'disabled', 'empty']) {
    const p = qualityFixture(); p.trigger().emit('click');
    if (mode === 'disabled') p.select.disabled = true;
    if (mode === 'empty') p.select.options = [];
    if (mode === 'single') p.select.options = [{ value: '0', textContent: '608p' }];
    p.picker.refresh({ ...p.summary, selectable: ['disabled', 'empty', 'single'].includes(mode), displayLabel: mode === 'loading' ? '清晰度' : '608p', note: '此来源未提供多个清晰度。' });
    assert.equal(p.trigger(), null); assert.equal(p.menu(), null); assert.equal(p.badge().hidden, false);
    assert.equal(p.badge().textContent, mode === 'loading' ? '清晰度' : '608p'); assert.equal(p.select.hidden, true);
    assert.equal(p.document.activeElement, p.focusTarget); assert.equal(p.changes(), 0); p.picker.destroy();
  }
});

test('quality teardown restores native placement, hidden state, focus and removes every menu listener', () => {
  for (const hidden of [false, true]) {
    const p = qualityFixture({ hidden }); p.trigger().emit('click'); p.picker.destroy(); p.picker.destroy(); p.picker.refresh(p.summary);
    assert.equal(p.select.parentElement, p.root); assert.equal(p.select.nextSibling, p.sibling); assert.equal(p.select.hidden, hidden);
    assert.equal(p.document.activeElement, p.focusTarget); assert.equal(p.container.children.length, 0);
    for (const node of p.elements) for (const [type, group] of node.listeners) assert.equal(group.size, node === p.select && type === 'change' ? 1 : 0);
  }
  const p = qualityFixture(); p.sibling.remove(); p.picker.destroy(); assert.equal(p.select.parentElement, p.root);
});

test('keyboard navigation reveals clipped menu choices by scrolling only the menu', () => {
  const p = fixture(); p.menu.clientHeight = 80; p.menu.scrollHeight = 240; p.menu.scrollTop = 0;
  p.menu.getBoundingClientRect = () => ({ top: 100 });
  p.choices.forEach((choice, index) => { choice.getBoundingClientRect = () => ({ top: 100 + index * 40 - p.menu.scrollTop, bottom: 140 + index * 40 - p.menu.scrollTop }); });
  p.trigger.emit('click'); assert.equal(p.menu.scrollTop, 0);
  p.key(p.menu, 'End'); assert.equal(p.document.activeElement, p.choices[4]); assert.equal(p.menu.scrollTop, 120);
  p.key(p.menu, 'Home'); assert.equal(p.document.activeElement, p.choices[0]); assert.equal(p.menu.scrollTop, 0); assert.equal(p.changes(), 0);
  p.menu.getBoundingClientRect = undefined; p.key(p.menu, 'End'); assert.equal(p.document.activeElement, p.choices[4]);
  p.picker.destroy();
});

test('rate menus replace only the native presentation and describe their selected option', () => {
  const page = fixture();
  assert.equal(page.select.hidden, true); assert.equal(page.root.classes.has('choice-picker'), true);
  assert.equal(page.trigger.attributes.get('aria-haspopup'), 'menu'); assert.equal(page.trigger.attributes.get('aria-controls'), 'speed-choices');
  assert.equal(page.trigger.attributes.get('aria-label'), '播放倍速：1×'); assert.equal(page.menu.hidden, true);
  assert.equal(page.menu.attributes.get('role'), 'menu');
  assert.equal(page.choices.filter(choice => choice.attributes.get('aria-checked') === 'true').length, 1);
  assert.equal(page.choices[1].attributes.get('aria-checked'), 'true');
  assert.equal(createRatePicker(null), null); assert.equal(createRatePicker({}), null);
  assert.equal(createRatePicker({ parentElement: page.root, ownerDocument: page.document, options: [] }), null);
});

test('opening focuses the selected option and clicking commits once, closes and restores trigger focus', () => {
  const page = fixture(); page.trigger.emit('click');
  assert.equal(page.menu.hidden, false); assert.equal(page.document.activeElement, page.choices[1]);
  page.choices[3].emit('click');
  assert.equal(page.select.value, '1.5'); assert.equal(page.changes(), 1); assert.equal(page.menu.hidden, true);
  assert.equal(page.document.activeElement, page.trigger); assert.equal(page.trigger.attributes.get('aria-expanded'), 'false');
  assert.equal(page.trigger.attributes.get('aria-label'), '播放倍速：1.5×');
  page.trigger.emit('click'); page.trigger.emit('click'); assert.equal(page.menu.hidden, true);
});

test('arrow navigation and Home/End only move focus; Escape cancels without changing playback speed', () => {
  const page = fixture(); assert.equal(page.key(page.trigger, 'ArrowDown').prevented, true);
  for (const [key, index] of [['ArrowDown', 2], ['End', 4], ['ArrowDown', 0], ['ArrowUp', 4], ['Home', 0]]) {
    assert.equal(page.key(page.menu, key).prevented, true); assert.equal(page.document.activeElement, page.choices[index]);
    assert.equal(page.select.value, '1'); assert.equal(page.changes(), 0);
  }
  assert.deepEqual(page.key(page.menu, 'Escape'), { prevented: true, stopped: true });
  assert.equal(page.menu.hidden, true); assert.equal(page.document.activeElement, page.trigger);
  assert.equal(page.key(page.menu, 'Tab').prevented, false);
  page.key(page.trigger, 'ArrowUp'); assert.equal(page.menu.hidden, false);
  page.key(page.trigger, 'Escape'); assert.equal(page.menu.hidden, true);
  assert.equal(page.key(page.trigger, 'Escape').prevented, false);
  assert.equal(page.key(page.trigger, 'Tab').prevented, false);
});

test('outside pointer and focus changes dismiss the popup without stealing focus', () => {
  const page = fixture(); page.trigger.emit('click');
  page.document.emit('pointerdown', { target: page.choices[2] }); assert.equal(page.menu.hidden, false);
  page.root.emit('focusout', { relatedTarget: page.choices[2] }); assert.equal(page.menu.hidden, false);
  const outside = {}; page.document.activeElement = outside;
  page.document.emit('pointerdown', { target: outside }); assert.equal(page.menu.hidden, true); assert.equal(page.document.activeElement, outside);
  page.trigger.emit('click'); page.document.activeElement = outside;
  page.root.emit('focusout', { relatedTarget: null }); assert.equal(page.menu.hidden, true); assert.equal(page.document.activeElement, outside);
});

test('external speed changes synchronize the menu; disabled controls cannot open it', () => {
  const page = fixture({ disabled: true }); page.trigger.emit('click'); assert.equal(page.menu.hidden, true);
  page.select.disabled = false; page.select.value = '2'; page.picker.refresh();
  assert.equal(page.trigger.attributes.get('aria-label'), '播放倍速：2×'); assert.equal(page.choices[4].attributes.get('aria-checked'), 'true');
  page.select.value = '1.25'; page.select.emit('change'); assert.equal(page.choices[2].attributes.get('aria-checked'), 'true');
  page.select.value = 'unknown'; page.picker.refresh(); page.trigger.emit('click');
  assert.equal(page.document.activeElement, page.choices[0]); assert.equal(page.trigger.attributes.get('aria-label'), '播放倍速：unknown');
});

test('teardown restores native controls, removes listeners and preserves existing hidden state', () => {
  const page = fixture({ label: '' }); page.trigger.emit('click'); page.picker.destroy(); page.picker.destroy(); page.picker.refresh();
  assert.equal(page.select.hidden, false); assert.equal(page.root.classes.has('choice-picker'), false);
  assert.deepEqual(page.root.children, [page.select]); assert.equal(page.document.activeElement, page.select);
  assert.equal(page.trigger.children.length, 2);
  for (const node of page.elements) for (const [type, listeners] of node.listeners) assert.equal(listeners.size, node === page.select && type === 'change' ? 1 : 0);
  const hidden = fixture({ hidden: true }); hidden.document.activeElement = {}; hidden.picker.destroy(); assert.equal(hidden.select.hidden, true);
});

test('menus open above the trigger when the viewport has insufficient space below it', () => {
  const page = fixture(); page.document.defaultView.innerHeight = 600;
  page.trigger.getBoundingClientRect = () => ({ top: 500, bottom: 538 }); page.menu.getBoundingClientRect = () => ({ height: 174, left: -10 });
  page.trigger.emit('click'); assert.equal(page.menu.classes.has('opens-up'), true);
  assert.equal(page.menu.classes.has('align-left'), true);
  page.trigger.emit('click'); page.document.defaultView.innerHeight = 900; page.trigger.emit('click');
  assert.equal(page.menu.classes.has('opens-up'), false);
});
