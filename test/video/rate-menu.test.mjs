import test from 'node:test';
import assert from 'node:assert/strict';
import { createRatePicker } from '../../source/video/player-controls.js';

function fixture({ disabled = false, hidden = false, label } = {}) {
  const document = { activeElement: null, defaultView: { Event }, listeners: new Map() };
  const elements = [];
  function element() {
    const attributes = new Map(), classes = new Set(), listeners = new Map();
    const node = { ownerDocument: document, attributes, classes, listeners, children: [], dataset: {}, hidden: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); } },
      setAttribute: (name, value) => attributes.set(name, value), getAttribute: name => attributes.get(name),
      append(...children) { this.children.push(...children); children.forEach(child => { child.parentElement = this; }); },
      remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); },
      contains(target) { return target === this || this.children.some(child => child.contains(target)); },
      focus(options) { assert.deepEqual(options, { preventScroll: true }); document.activeElement = this; },
      addEventListener(type, handler) { const group = listeners.get(type) || new Set(); group.add(handler); listeners.set(type, group); },
      removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
      emit(type, event = {}) { for (const handler of listeners.get(type) || []) handler(event); },
      dispatchEvent(event) { this.emit(event.type, event); },
    };
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
