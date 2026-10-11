import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as core from '../../source/video/core.js';
import * as playback from '../../source/video/playback.js';
import { createHomeLoader } from '../../source/video/home.js';
import { catalogSummary } from '../../source/video/catalog.js';
import { appHarness } from './fixtures/app-harness.cjs';

const source = await readFile(new URL('../../source/video/app.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const episode = number => ({ name: '第' + number + '集', url: 'https://example.com/' + number + '.mp4' });
const film = { uid: 'liangzi:12', source: 'liangzi', id: '12', title: '测试剧', year: '2026', category: '国产剧', lines: [{ name: '完整线', episodes: [1, 2, 3].map(episode) }, { name: '缺第2集', episodes: [1, 3].map(episode) }] };

function typeChoiceHarness() {
  const document = { activeElement: null }; const navigation = []; const focus = [];
  const group = { dataset: {}, children: [], hidden: false, scrollLeft: 50,
    contains: node => group.children.includes(node),
    parentElement: { classList: { toggle(name, value) { group[name] = value; } } },
    insertBefore(node, before) {
      if (group.children.includes(node)) node.remove();
      const index = before ? group.children.indexOf(before) : group.children.length;
      group.children.splice(index, 0, node);
    },
  };
  const fallback = { focus(options) { document.activeElement = this; focus.push(clone(options)); } };
  const state = { route: { view: 'browse', category: 'anime', type: 0 } };
  const harness = appHarness(source, { state, document, $: id => id === 'type-picks' ? group : fallback, navigate: hash => navigation.push(hash),
    button: (_text, _className, click) => {
      const classes = new Set(); const attributes = new Map();
      return { dataset: {}, attributes, click, tabIndex: 0,
        classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
        setAttribute: (name, value) => attributes.set(name, value),
        remove() { group.children.splice(group.children.indexOf(this), 1); if (document.activeElement === this) document.activeElement = null; },
        focus(options) { document.activeElement = this; focus.push(clone(options)); },
      };
    },
  });
  harness.include('renderTypes', 'renderCatalog');
  return { harness, state, document, group, fallback, focus, navigation };
}

test('progressive directory renders retain category button identity, keyboard focus and scroll without selecting a new type', () => {
  const { harness, state, document, group, focus, navigation } = typeChoiceHarness();
  const category = { id: 'anime', types: [[0, '全部'], [29, '国漫'], [30, '日漫']] };
  harness.run('renderTypes(' + JSON.stringify(category) + ')');
  const buttons = [...group.children]; const focused = buttons[2]; document.activeElement = focused;
  for (let batch = 0; batch < 4; batch++) harness.run('renderTypes(' + JSON.stringify(category) + ')');
  assert.deepEqual(group.children, buttons); assert.equal(document.activeElement, focused); assert.equal(group.scrollLeft, 50);
  assert.equal(state.route.type, 0); assert.equal(navigation.length, 0);
  assert.equal(group.children.filter(option => option.tabIndex === 0).length, 1); assert.equal(focused.tabIndex, 0);
  assert.equal(focused.attributes.get('aria-pressed'), 'false'); assert.equal(buttons[0].attributes.get('aria-pressed'), 'true');
  assert.equal(focus.every(options => options.preventScroll === true), true);
  state.route.type = 30; document.activeElement = null; harness.run('renderTypes(' + JSON.stringify(category) + ')');
  assert.equal(group.children[2].classList.contains('active'), true); assert.equal(document.activeElement, null);
});

test('category changes refresh retained button destinations and safely handle removed, reordered and hidden focused types', () => {
  const { harness, state, document, group, fallback, navigation } = typeChoiceHarness();
  harness.run('renderTypes({id:"anime",types:[[0,"全部"],[29,"国漫"],[30,"日漫"]]})');
  const all = group.children[0]; const retained = group.children[2]; document.activeElement = retained;
  harness.run('renderTypes({id:"anime",types:[[30,"日漫更新"],[0,"全部"],[29,"国漫"]]})');
  assert.equal(group.children[0], retained); assert.equal(document.activeElement, retained); assert.equal(retained.textContent, '日漫更新');
  state.route.category = 'tv'; state.route.type = 13;
  harness.run('renderTypes({id:"tv",types:[[0,"全部"],[13,"国产剧"]]})');
  assert.equal(group.children[0], all); assert.equal(group.children.length, 2); assert.equal(document.activeElement, group.children[1]);
  all.click(); assert.equal(navigation.at(-1), '#browse?category=tv&type=0');
  group.children[1].click(); assert.equal(navigation.at(-1), '#browse?category=tv&type=13');
  state.route.view = 'search'; harness.run('renderTypes({id:"tv",types:[[0,"全部"],[13,"国产剧"]]})');
  assert.equal(group.hidden, true); assert.equal(group['search-filters'], true); assert.equal(document.activeElement, fallback);
  const outside = {}; document.activeElement = outside;
  harness.run('renderTypes({id:"tv",types:[[0,"全部"],[13,"国产剧"]]})'); assert.equal(document.activeElement, outside);
  state.route.view = 'browse'; state.route.type = 999;
  harness.run('renderTypes({id:"tv",types:[[0,"全部"],[13,"国产剧"]]})');
  assert.equal(group.hidden, false); assert.equal(group.children[0].tabIndex, 0); assert.equal(document.activeElement, outside);
  document.activeElement = group.children[0]; harness.run('renderTypes({id:"tv",types:[]})');
  assert.equal(group.children.length, 0); assert.equal(document.activeElement, fallback);
});

test('episode arrows follow the rendered rows across responsive layouts and descending order without playing', () => {
  for (const columns of [3, 4, 6]) for (const reverse of [false, true]) {
    let focused; let prevented = 0;
    const children = Array.from({ length: columns * 2 + 2 }, (_, index) => ({
      number: reverse ? columns * 2 + 2 - index : index + 1, tabIndex: -1,
      getClientRects: () => [{}],
      getBoundingClientRect: () => ({ top: Math.floor(index / columns) * 46, left: index % columns * 50, width: 42 }),
      focus() { focused = this; }, click() { assert.fail('Moving focus must not play an episode'); },
    }));
    const group = { id: 'episodes', children };
    const event = { key: 'ArrowDown', currentTarget: group, target: children[columns - 1], preventDefault() { prevented++; } };
    const harness = appHarness(source, { event }); harness.include('handleChoiceKey', 'handleAccountFocusOut');
    harness.run('handleChoiceKey(event)'); assert.equal(focused, children[columns * 2 - 1]);
    assert.equal(children.filter(item => item.tabIndex === 0).length, 1);
    event.target = focused; harness.run('handleChoiceKey(event)'); assert.equal(focused, children.at(-1));
    event.target = focused; harness.run('handleChoiceKey(event)'); assert.equal(focused, children.at(-1));
    event.key = 'ArrowUp'; event.target = focused; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[columns + 1]);
    event.target = focused; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[1]);
    event.target = focused; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[1]);
    assert.equal(prevented, 6);
  }
});

test('choice navigation skips hidden and disabled choices and preserves native keys and handled events', () => {
  let focused; let prevented = 0;
  const children = Array.from({ length: 7 }, (_, index) => ({
    disabled: index === 4, tabIndex: -1,
    getClientRects: () => index === 3 ? [] : [{}],
    getBoundingClientRect: () => ({ top: Math.floor(index / 3) * 46, left: index % 3 * 50, width: 42 }),
    focus() { focused = this; },
  }));
  const group = { id: 'episodes', children };
  const event = { key: 'ArrowDown', currentTarget: group, target: children[1], preventDefault() { prevented++; } };
  const harness = appHarness(source, { event }); harness.include('handleChoiceKey', 'handleAccountFocusOut');
  harness.run('handleChoiceKey(event)'); assert.equal(focused, children[5]);
  event.target = children[0]; event.key = 'ArrowLeft'; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[6]);
  event.target = children[2]; event.key = 'ArrowRight'; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[5]);
  event.target = focused; event.key = 'Home'; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[0]);
  event.target = focused; event.key = 'End'; harness.run('handleChoiceKey(event)'); assert.equal(focused, children[6]);
  assert.equal(prevented, 5);
  for (const flag of ['defaultPrevented', 'isComposing', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    event.key = 'ArrowLeft'; event[flag] = true; harness.run('handleChoiceKey(event)'); event[flag] = false;
  }
  for (const key of ['Tab', 'Enter', ' ', 'Escape', 'PageDown']) { event.key = key; harness.run('handleChoiceKey(event)'); }
  event.key = 'ArrowDown'; group.id = 'year-filter'; harness.run('handleChoiceKey(event)');
  event.key = 'ArrowRight'; event.target = {}; harness.run('handleChoiceKey(event)');
  assert.equal(prevented, 5); assert.equal(focused, children[6]);
});

test('Escape closes only the nearest disclosure and returns focus without scrolling', () => {
  const outer = { open: true }; const account = { open: false }; const focus = [];
  let nearest; let prevented;
  const event = { key: 'Escape', target: { closest: selector => { assert.equal(selector, 'details[open]'); return nearest; } }, preventDefault: () => { prevented = true; } };
  const harness = appHarness(source, { $: () => account, event }); harness.include('handlePanelEscape', 'handlePlaybackKey');
  for (const name of ['filter', 'source-picker', 'source-card', 'source-status', 'account', 'settings']) {
    const summary = { focus: options => focus.push([name, clone(options)]) };
    nearest = { open: true, querySelector: selector => { assert.equal(selector, ':scope > summary'); return summary; } };
    prevented = false; harness.run('handlePanelEscape(event)');
    assert.equal(nearest.open, false); assert.equal(outer.open, true); assert.equal(prevented, true);
    assert.deepEqual(focus.at(-1), [name, { preventScroll: true }]);
  }
});

test('Escape preserves handled events, composition, native selects and ordinary keys and dismisses an unfocused account menu safely', () => {
  let focused = 0; let prevented = 0; let nearest = null;
  const account = { open: true, querySelector: () => ({ focus: () => { focused++; } }) };
  const event = { key: 'Escape', target: { closest: () => nearest }, preventDefault: () => { prevented++; } };
  const harness = appHarness(source, { $: () => account, event }); harness.include('handlePanelEscape', 'handlePlaybackKey');
  for (const flag of ['defaultPrevented', 'isComposing']) {
    event[flag] = true; harness.run('handlePanelEscape(event)'); assert.equal(account.open, true); event[flag] = false;
  }
  event.key = 'Tab'; harness.run('handlePanelEscape(event)'); assert.equal(account.open, true);
  event.key = 'Escape'; event.target.tagName = 'SELECT'; harness.run('handlePanelEscape(event)'); assert.equal(account.open, true);
  event.target.tagName = 'BUTTON'; harness.run('handlePanelEscape(event)'); assert.equal(account.open, false); assert.equal(focused, 1); assert.equal(prevented, 1);
  harness.run('handlePanelEscape(event)'); assert.equal(prevented, 1);
  nearest = { open: true, querySelector: () => null }; harness.run('handlePanelEscape(event)'); assert.equal(nearest.open, false); assert.equal(prevented, 2);
});

test('tabbing outside the account menu closes it without stealing focus or closing on window blur', () => {
  const inside = {}; const outside = {};
  const panel = { open: true, contains: target => target === inside };
  const event = { relatedTarget: inside };
  const harness = appHarness(source, { $: () => panel, event }); harness.include('handleAccountFocusOut', 'handlePanelEscape');
  harness.run('handleAccountFocusOut(event)'); assert.equal(panel.open, true);
  event.relatedTarget = null; harness.run('handleAccountFocusOut(event)'); assert.equal(panel.open, true);
  event.relatedTarget = outside; harness.run('handleAccountFocusOut(event)'); assert.equal(panel.open, false);
  harness.run('handleAccountFocusOut(event)'); assert.equal(panel.open, false);
});

test('year choices merge premiere-year ranges, retain loaded films and clear malformed restored filters', () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, children: [], replaceChildren(...children) { this.children = children; } });
    return nodes.get(id);
  };
  const films = [{ year: '2024' }, { year: '2024–' }, { year: '2024–2026' }, { year: '20024' }, { year: '' }, { year: '2015' }];
  const state = { catalog: { filters: { year: '2024–', area: '', status: '' }, items: films } };
  const harness = appHarness(source, { ...core, state, $: node, document: { activeElement: null }, Date: class { getFullYear() { return 2026; } },
    button: (textContent, className) => ({ textContent, className, dataset: {}, attributes: new Map(), setAttribute(key, value) { this.attributes.set(key, value); } }) });
  harness.include('renderFilters', 'renderCatalog'); harness.run('renderFilters()');
  const years = node('year-filter').children.map(chip => chip.dataset.value);
  assert.equal(state.catalog.filters.year, '2024');
  assert.equal(years.filter(year => year === '2024').length, 1);
  assert.equal(years.includes('2024–'), false); assert.equal(years.includes('20024'), false); assert.equal(years.includes('2015'), true);
  assert.equal(node('year-filter').children.find(chip => chip.dataset.value === '2024').attributes.get('aria-pressed'), 'true');
  assert.equal(node('selected-filters').children[0].textContent, '2024 ×'); assert.equal(state.catalog.items, films);
  state.catalog.filters.year = '20024'; harness.run('renderFilters()');
  assert.equal(state.catalog.filters.year, ''); assert.equal(node('filter-summary').hidden, true);
  assert.equal(node('year-filter').children[0].attributes.get('aria-pressed'), 'true'); assert.equal(state.catalog.items.length, 6);
});

test('source status refresh preserves expanded cards, focus and scroll while updating query details', () => {
  function node(tag, className = '', textContent = '') {
    const classes = new Set(className.split(' ').filter(Boolean));
    const item = { tag, className, textContent, dataset: {}, children: [], open: false, parent: null,
      classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      querySelector(selector) { for (const child of this.children) { if (child.classList.contains(selector.slice(1))) return child; const match = child.querySelector(selector); if (match) return match; } return null; },
      remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); },
      insertBefore(child, before) { if (child.parent) child.remove(); child.parent = this; const index = before ? this.children.indexOf(before) : this.children.length; this.children.splice(index, 0, child); },
    };
    return item;
  }
  const grid = node('div'); grid.scrollTop = 125;
  const sources = [{ id: 'liangzi', name: '量子资源' }, { id: 'auete', name: 'Auete', search: false }, { id: 'zip0', name: 'ZIP0', browseTypes: [] }];
  const health = new Map(); const profiles = new Map();
  const harness = appHarness(source, { ...core, SOURCES: sources, $: () => grid, el: node, state: { health },
    sourceHealth: { profile: (id, operation) => profiles.get(id + ':' + operation) || {} }, sourceSearchNotice: () => '搜索要求验证' });
  const start = source.indexOf('function renderSources('); const end = source.indexOf('\nasync function request(', start);
  assert.ok(start >= 0 && end > start); harness.run(source.slice(start, end)); harness.run('renderSources()');
  assert.equal(grid.children.length, 3);
  const card = grid.children[0]; card.open = true; const focused = card.children[0];
  assert.equal(card.querySelector('.source-health-status').textContent, '本次尚未查询');
  health.set('liangzi', '目录查询失败，可切换其他来源');
  profiles.set('liangzi:search', { observed: true, cooldownMs: 120000 });
  profiles.set('liangzi:browse', { observed: true, failures: 1 });
  harness.run('renderSources()');
  assert.equal(grid.children[0], card); assert.equal(card.children[0], focused); assert.equal(card.open, true); assert.equal(grid.scrollTop, 125);
  assert.equal(card.querySelector('.source-health-status').classList.contains('error'), true);
  const detail = card.querySelector('.source-health-detail');
  assert.match(detail.children[2].textContent, /2 分钟/); assert.match(detail.children[3].textContent, /最近连接失败/);
  health.set('liangzi', '目录查询成功 · 0.6 秒'); profiles.set('liangzi:search', { observed: true, latencyMs: 600 });
  harness.run('renderSources()');
  assert.equal(card.querySelector('.source-health-status').classList.contains('error'), false);
  assert.match(detail.children[2].textContent, /0.6 秒/);
  assert.match(grid.children[1].querySelector('.source-health-detail').children[0].textContent, /搜索要求验证/);
  assert.match(grid.children[2].querySelector('.source-health-detail').children[0].textContent, /聚合结果按上游去重/);
});

test('quality alternative reveals source choices before focusing and scrolling without restarting playback', () => {
  for (const reducedMotion of [false, true]) for (const alreadyOpen of [false, true]) {
    let click; const actions = []; const picker = { open: alreadyOpen };
    const video = { paused: true, currentTime: 120 }; const state = { episode: 1 };
    const target = {
      scrollIntoView(options) { assert.equal(picker.open, true); actions.push(['scroll', clone(options)]); },
      focus(options) { assert.equal(picker.open, true); actions.push(['focus', clone(options)]); },
    };
    const nodes = { 'quality-source': { addEventListener: (_type, handler) => { click = handler; } }, 'watch-sources': picker, 'watch-sources-toggle': target };
    const harness = appHarness(source, { $: id => nodes[id], video, state, window: { matchMedia: () => ({ matches: reducedMotion }) } });
    harness.include('focusPlayerArea', 'automaticPlaybackAllowed');
    const start = source.indexOf("$('quality-source').addEventListener"); const end = source.indexOf("$('screen-mode').addEventListener", start);
    assert.ok(start >= 0 && end > start); harness.run(source.slice(start, end)); click();
    assert.deepEqual(actions, [['scroll', { block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' }], ['focus', { preventScroll: true }]]);
    assert.deepEqual(video, { paused: true, currentTime: 120 }); assert.equal(state.episode, 1);
  }
});

test('focused native video seeks exactly ten seconds and keeps control navigation and modified keys intact', () => {
  let capture; let bubble; let plays = 0; let pauses = 0; let next = 0; let fullscreen = 0;
  const state = { route: { view: 'watch' }, detailLoading: false };
  const video = { tagName: 'VIDEO', currentTime: 120, duration: 8640, paused: true,
    addEventListener(type, handler, options) { assert.equal(type, 'keydown'); assert.equal(options.capture, true); capture = handler; },
    play() { plays++; this.paused = false; return Promise.resolve(); }, pause() { pauses++; this.paused = true; } };
  const harness = appHarness(source, { state, video, document: { addEventListener: (type, handler) => { assert.equal(type, 'keydown'); bubble = handler; } }, playNext: () => next++, toggleFullscreen: () => fullscreen++, toast() {} });
  const start = source.indexOf('function handlePlaybackKey('); const end = source.indexOf("document.querySelectorAll('[data-blog-link]')", start);
  assert.ok(start >= 0 && end > start); harness.run(source.slice(start, end));
  function dispatch(code, target = video, extra = {}) {
    const event = { code, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    if (target === video) {
      capture(event);
      // Native controls seek by a percentage before a document bubble handler.
      if (!event.defaultPrevented && code === 'ArrowRight') video.currentTime += video.duration / 100;
      if (!event.defaultPrevented && code === 'ArrowLeft') video.currentTime -= video.duration / 100;
    }
    bubble(event); return event;
  }
  assert.equal(dispatch('ArrowRight').defaultPrevented, true); assert.equal(video.currentTime, 130);
  dispatch('ArrowLeft'); assert.equal(video.currentTime, 120);
  video.currentTime = 3; dispatch('ArrowLeft'); assert.equal(video.currentTime, 0);
  video.currentTime = 8635; dispatch('ArrowRight'); assert.equal(video.currentTime, 8640);
  video.currentTime = 120; dispatch('ArrowRight', { tagName: 'DIV' }); assert.equal(video.currentTime, 130);
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY']) {
    assert.equal(dispatch('ArrowRight', { tagName }).defaultPrevented, false); assert.equal(video.currentTime, 130);
  }
  assert.equal(dispatch('ArrowLeft', { tagName: 'DIV', isContentEditable: true }).defaultPrevented, false);
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) assert.equal(dispatch('ArrowLeft', { tagName: 'DIV' }, { [modifier]: true }).defaultPrevented, false);
  assert.equal(dispatch('Space').defaultPrevented, false); assert.equal(plays, 0); assert.equal(pauses, 0);
  dispatch('Space', { tagName: 'DIV' }); assert.equal(plays, 1);
  dispatch('Space', { tagName: 'DIV' }); assert.equal(pauses, 1);
  dispatch('KeyN'); dispatch('KeyF'); assert.equal(next, 1); assert.equal(fullscreen, 1);
  assert.equal(dispatch('ArrowUp').defaultPrevented, false);
  for (const context of ['.source-settings', '.account-panel']) for (const code of ['Space', 'ArrowRight', 'KeyN', 'KeyF']) {
    const before = { time: video.currentTime, plays, pauses, next, fullscreen };
    assert.equal(dispatch(code, { tagName: 'DIV', closest: selector => selector.split(',').some(value => value.trim() === context) ? {} : null }).defaultPrevented, false);
    assert.deepEqual({ time: video.currentTime, plays, pauses, next, fullscreen }, before);
  }
  dispatch('ArrowRight', { tagName: 'DIV' }, { defaultPrevented: true }); assert.equal(video.currentTime, 130);
  state.detailLoading = true; assert.equal(dispatch('ArrowRight', { tagName: 'DIV' }).defaultPrevented, false);
  state.detailLoading = false; state.route.view = 'home'; assert.equal(dispatch('ArrowRight', { tagName: 'DIV' }).defaultPrevented, false);
  state.route.view = 'watch'; video.duration = Infinity; assert.equal(dispatch('ArrowRight', { tagName: 'DIV' }).defaultPrevented, false);
});

test('source capability notices distinguish validation from an unavailable public search', () => {
  const harness = appHarness(source, {}); harness.include('sourceSearchNotice', 'renderServiceStatus');
  assert.equal(harness.run('sourceSearchNotice({id:"auete"})'), '搜索要求验证');
  assert.equal(harness.run('sourceSearchNotice({id:"diyi"})'), '源站未开放搜索');
});

test('content notice updates when changing episode or source and never blocks playback controls', () => {
  const node = { hidden: true, textContent: '', classList: { toggle: (name, value) => { node[name] = value; } } };
  const harness = appHarness(source, { ...core, $: () => node }); harness.include('renderContentNotice', 'renderDetail');
  harness.run('renderContentNotice("notice", { source: "diyi", id: "104" }, "第02集")');
  assert.equal(node.hidden, false); assert.match(node.textContent, /^已发现博彩推广/); assert.equal(node['has-promotion'], true);
  harness.run('renderContentNotice("notice", { source: "diyi", id: "104" }, "第01集")');
  assert.match(node.textContent, /^来源有推广记录/); assert.match(node.textContent, /当前视频未逐一检查/);
  harness.run('renderContentNotice("notice", { source: "liangzi", id: "12" })');
  assert.match(node.textContent, /^推广情况未核验/); assert.equal(node['has-promotion'], false);
});

test('top search continuation preserves results and keyboard focus through loading, pause and completion', () => {
  const nodes = new Map(); const document = { activeElement: null, querySelectorAll: () => [] };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { id, hidden: false, disabled: false, classList: { toggle() {} }, parentElement: { classList: { toggle() {} } }, setAttribute() {}, replaceChildren() {}, focus() { document.activeElement = this; } });
    return nodes.get(id);
  };
  const state = { route: { view: 'search', category: 'anime', query: '凡人' }, catalog: { items: [film], filters: {}, loading: false, feeds: [{ source: 'liangzi', page: 1, pages: 1 }, { source: 'ruyi', page: 0, pages: 1 }] } };
  const rendered = [];
  const harness = appHarness(source, { ...core, catalogSummary, state, document, $: node, sourceName: name => name, renderTypes() {}, renderFilters() {}, renderGrid: (_id, items) => rendered.push(items), skeletonCards: () => [], button: () => ({ setAttribute() {} }) });
  harness.include('renderCatalog', 'visibleCardAnchor');
  harness.run('renderCatalog()');
  assert.equal(node('continue-search').hidden, false); assert.equal(node('continue-search').disabled, false);
  assert.match(node('catalog-scope').textContent, /1 个来源尚未查询/); assert.deepEqual(rendered.at(-1), [film]);
  document.activeElement = node('continue-search'); state.catalog.loading = true; harness.run('renderCatalog()');
  assert.equal(node('continue-search').hidden, true); assert.equal(node('continue-search').disabled, true); assert.equal(document.activeElement.id, 'pause-catalog');
  assert.deepEqual(rendered.at(-1), [film]);
  state.catalog.loading = false; state.catalog.stopped = true; harness.run('renderCatalog()');
  assert.equal(document.activeElement.id, 'continue-search'); assert.equal(node('continue-search').disabled, false);
  state.catalog.feeds[1].page = 1; harness.run('renderCatalog()');
  assert.equal(node('continue-search').hidden, true); assert.equal(document.activeElement.id, 'filter-toggle');
  state.catalog.feeds[1].failed = true; state.catalog.feeds[0].failed = true; state.catalog.feeds[0].page = 0; state.catalog.feeds[1].page = 0;
  harness.run('renderCatalog()'); assert.equal(node('continue-search').textContent, '重试搜索'); assert.equal(node('continue-search').hidden, false);
  state.route.view = 'browse'; harness.run('renderCatalog()'); assert.equal(node('continue-search').hidden, true); assert.equal(node('load-more').hidden, false);
});

test('both continuation controls invoke the same existing catalog action once per click', () => {
  const handlers = new Map(); const calls = [];
  const harness = appHarness(source, { $: id => ({ addEventListener: (_type, handler) => handlers.set(id, handler) }), loadCatalog: options => calls.push(clone(options)) });
  const start = source.indexOf("$('load-more').addEventListener");
  const end = source.indexOf("$('reload-catalog').addEventListener", start);
  harness.run(source.slice(start, end));
  handlers.get('continue-search')(); handlers.get('load-more')();
  assert.deepEqual(calls, [{ more: true }, { more: true }]);
});

test('reviewed aliases share favorite state and progress and unfavoriting removes all legacy copies', () => {
  const alias = { ...film, title: '凡人修仙传2020', year: '2020', category: '国漫' };
  const current = { ...alias, title: '凡人修仙传', uid: 'ruyi:13', source: 'ruyi', id: '13' };
  const state = { favorites: [alias, current], history: [{ ...alias, episode: '第12集', position: 90 }], route: { view: 'search' } };
  const nodes = new Map();
  const harness = appHarness(source, { ...core, state, current, $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); }, syncSavedRecords() {}, save() {}, toast() {}, renderCatalog() {}, updateFavoriteButtons() {} });
  harness.include('favoriteFor', 'renderAccount'); harness.include('progressFor', 'minuteLabel'); harness.include('toggleFavorite', 'updateCounts');
  harness.include('updateCounts', 'updateFavoriteButtons'); harness.run('updateCounts()');
  assert.equal(nodes.get('favorite-count').textContent, '1'); assert.equal(nodes.get('history-count').textContent, '1');
  assert.equal(harness.run('favoriteFor(current)'), true); assert.equal(harness.run('progressFor(current).position'), 90);
  harness.run('toggleFavorite(current)'); assert.equal(state.favorites.length, 0); assert.equal(nodes.get('favorite-count').textContent, '0');
});

test('page navigation cancels home requests and returning home opens a fresh queue', async () => {
  const requests = []; const nodes = new Map(); const location = { hash: '#library' };
  const homeLoader = createHomeLoader({ request: options => new Promise((resolve, reject) => {
    requests.push(options);
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }) });
  const state = { route: { view: 'home' }, detailVersion: 0, watchlist: { loading: false }, catalog: { loading: false } };
  const harness = appHarness(source, {
    ...core, state, location, homeLoader, submittedSearchHash: '', filterTimer: null, clearTimeout() {},
    document: { activeElement: null, querySelectorAll: () => [], body: { classList: { toggle() {} } } },
    window: { scrollY: 0, scrollTo() {} },
    $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
    syncSavedRecords() {}, rememberCatalogPosition() {}, rememberHomePosition() {}, cancelFallback() {}, renderLibrary() {}, renderHome() {},
    playbackIntent: { clear() {} }, variantDiscovery: { stop() {} },
    listNavigation: { catalog: () => null, home: () => null, remember: hash => hash },
  });
  harness.include('handleRoute', 'applyPendingResume');
  const pending = homeLoader.open(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 4);
  harness.run('handleRoute()'); await pending;
  assert.equal(state.route.view, 'library'); assert.equal(homeLoader.state.loading, false);
  assert.ok(requests.every(options => options.signal.aborted)); assert.equal(requests.length, 4);
  location.hash = '#home'; harness.run('handleRoute()'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.route.view, 'home'); assert.equal(requests.length, 8);
  assert.ok(requests.slice(4).every(options => !options.signal.aborted));
  const fresh = homeLoader.open(); homeLoader.stop(); await fresh;
});

function page(current = film, { saved = null, route = {}, override = null, intent = playback.createPlaybackIntent() } = {}) {
  const nodes = new Map(); const started = []; const messages = []; const failures = [];
  const state = { detailVersion: 0, lastList: '#library?tab=history', favoritesDirty: false, watchlist: { loading: false }, restorePlaybackIntent: true, resumeOverride: override };
  const bindings = {
    ...core, ...playback, state, document: { hidden: false }, navigator: { onLine: true },
    $: id => { if (!nodes.has(id)) nodes.set(id, { checked: true, replaceChildren() {} }); return nodes.get(id); },
    cancelFallback() {}, destroyPlayback() {}, renderPlaybackExperience() {}, updateFavoriteButtons() {}, updateTrackedFavorite() {}, renderDetail() {}, renderWatch() {}, renderEpisodes() {}, fallbackMessage() {}, save() {},
    variantDiscovery: { stop() {}, open() {} }, playbackExperience: { open() {}, observe() {}, finish() {}, priority: () => 0 },
    playbackIntent: intent, playbackFallback: { begin() {} }, allKnownVideos: () => [current], request: async () => ({ videos: [current] }), progressFor: () => saved,
    screenMessage: message => messages.push(message), reportPlaybackFailure: message => failures.push(message),
    startEpisode: (index, position, _automatic, _recovered, paused) => started.push({ name: current.lines[state.line].episodes[index].name, position, paused }),
    route: { view: 'watch', source: current.source, id: current.id, episode: null, ...route },
  };
  const harness = appHarness(source, bindings); harness.include('filmRoute', 'navigate'); harness.include('prepareVideo', 'switchVariant');
  return { state, nodes, messages, started, failures, open: () => harness.run('prepareVideo(route)') };
}

test('page resume preserves a missing saved episode and position without starting a neighboring episode', async () => {
  const current = { ...film, lines: [{ episodes: [1, 2].map(episode) }] };
  const view = page(current, { saved: { episode: '第3集', position: 60 } }); await view.open();
  assert.equal(view.started.length, 0); assert.equal(view.state.pendingResume, 60);
  assert.equal(view.state.resumeOverride.episode, '第3集'); assert.match(view.messages.at(-1), /暂无 第3集/);
  assert.equal(view.nodes.get('episode-caption').textContent, '原观看集数：第3集');
});

test('page refresh and legacy pause intent restore the same episode after a line index changes', async () => {
  for (const route of [{ episode: 1, episodeName: '第3集' }, { episode: 1 }]) {
    const intent = playback.createPlaybackIntent(); intent.remember(film, 1, true, '第3集');
    const view = page(film, { saved: { episode: '第3集', position: 60 }, route, intent }); await view.open();
    assert.deepEqual(clone(view.started), [{ name: '第3集', position: 60, paused: true }]);
  }
  const view = page(film, { saved: { episode: '第3集', position: 60 }, route: { episode: 1, episodeName: '第2集' } }); await view.open();
  assert.deepEqual(clone(view.started), [{ name: '第2集', position: 0, paused: false }]);
});

test('page history can find an episode only available on another line without discarding its progress', async () => {
  const current = { ...film, lines: [{ episodes: [1, 2].map(episode) }, { episodes: [1, 3].map(episode) }] };
  const view = page(current, { saved: { episode: '第3集', position: 60 } }); await view.open();
  assert.equal(view.state.line, 1); assert.deepEqual(clone(view.started), [{ name: '第3集', position: 60, paused: false }]);
  const empty = page({ ...film, lines: [] }, { saved: { episode: '第3集', position: 60 } }); await empty.open();
  assert.deepEqual(empty.started, []); assert.deepEqual(empty.failures, ['来源没有可播放的剧集']);
});

test('page episode start writes the actual name into its route and sends the stable reference to the resolver', async () => {
  const current = { ...film, source: 'pianku', uid: 'pianku:12', lines: [{ name: '备用线', episodes: [{ name: '第1集', ref: '2-1' }, { name: '第3集', ref: '2-3' }] }] };
  const state = { current, line: 0, route: { view: 'watch' }, playbackVersion: 0, initialPlayback: false }; const nodes = new Map(); const calls = []; const routes = []; let finish;
  const harness = appHarness(source, {
    ...core, state, config: {}, backendTransport: { fetch }, AbortController, window: { history: { replaceState: (_state, _title, url) => routes.push(url) } },
    $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
    cancelFallback() {}, playbackFallback: { begin() {} }, fallbackMessage() {}, destroyPlayback: () => { state.playbackVersion++; },
    playbackIntent: playback.createPlaybackIntent(), playbackExperience: { begin() {} }, renderPlaybackExperience() {}, renderEpisodes() {}, screenMessage() {}, monitorPlayback() {},
    requestEpisode: (...args) => { calls.push(args); return new Promise(resolve => { finish = resolve; }); },
  });
  harness.include('filmRoute', 'navigate'); harness.include('startEpisode', 'renderVariantDiscovery');
  const pending = harness.run('startEpisode(1,60,false,false,true)');
  assert.deepEqual(calls[0].slice(0, 4), ['pianku', '12', '2-3', '第3集']);
  assert.equal(core.parseRoute(routes[0]).episodeName, '第3集'); assert.equal(core.parseRoute(routes[0]).episode, 1);
  state.playbackVersion++; finish('https://example.com/3.mp4'); await pending;
});

function saving(storage, initial = [], account = null) {
  const state = { favorites: clone(initial), history: [], account }; const messages = []; const synced = [];
  const baseline = { 'video-favorites': clone(initial), 'video-history': [] };
  const harness = appHarness(source, { ...core, state, storage, favoriteStorageKey: user => user ? 'video-favorites:' + user.id : 'video-favorites', accountClient: { changed: items => synced.push(clone(items)) }, savedBaselines: baseline, toast: message => messages.push(message) });
  harness.include('save', 'syncSavedRecords'); harness.include('syncSavedRecords', 'renderSavedRecords');
  return { state, baseline, messages, synced, save: () => harness.run('save("video-favorites",state.favorites)'), sync: () => harness.run('syncSavedRecords()') };
}
const savedFilm = () => { const { lines, ...item } = film; return item; };

test('page saves and cross-tab merges use the active account without changing guest or another account collection', () => {
  const item = savedFilm(); const guest = { ...item, uid: 'ruyi:13', source: 'ruyi', id: '13', title: '本机影片' };
  const values = new Map([['video-favorites', JSON.stringify([guest])], ['video-favorites:13', JSON.stringify([guest])]]);
  const view = saving({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, [], { id: '12' });
  view.state.favorites.push(item); view.save(); assert.deepEqual(JSON.parse(values.get('video-favorites:12')), [item]);
  assert.deepEqual(JSON.parse(values.get('video-favorites')), [guest]); assert.deepEqual(JSON.parse(values.get('video-favorites:13')), [guest]);
  values.set('video-favorites:12', '[]'); view.sync(); assert.deepEqual(view.state.favorites, []); assert.deepEqual(view.synced.at(-1), []);
});

test('failed page saves preserve additions, changes and removals across navigation and recover when storage becomes writable', () => {
  const values = new Map(); let writable = false;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (!writable) throw new Error('quota'); values.set(key, value); } };
  const view = saving(storage); view.state.favorites.push(savedFilm()); view.save();
  for (let index = 0; index < 3; index++) view.sync();
  assert.equal(view.state.favorites.length, 1); assert.equal(view.baseline['video-favorites'].length, 0); assert.equal(view.messages.length, 1);
  const other = { ...savedFilm(), uid: 'ruyi:13', source: 'ruyi', id: '13', title: '另一部' };
  values.set('video-favorites', JSON.stringify([other])); view.sync(); assert.equal(view.state.favorites.length, 2);
  writable = true; view.save(); assert.equal(JSON.parse(values.get('video-favorites')).length, 2);
  writable = false; view.state.favorites[0].remarks = '更新至9集'; view.save(); view.sync(); assert.equal(view.state.favorites[0].remarks, '更新至9集');
  view.state.favorites = []; view.save(); view.sync(); assert.equal(view.state.favorites.length, 0);
  writable = true; view.save(); assert.deepEqual(JSON.parse(values.get('video-favorites')), []);
});

test('failed save merges still honor external deletions and retain current-tab data with unavailable storage', () => {
  const item = savedFilm(); const values = new Map([['video-favorites', JSON.stringify([item])]]);
  const view = saving({ getItem: key => values.get(key) ?? null, setItem() { throw new Error('quota'); } }, [item]);
  view.state.favorites[0].remarks = '更新至9集'; view.save(); values.delete('video-favorites'); view.sync(); assert.equal(view.state.favorites.length, 0);
  for (const storage of [null, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }]) {
    const blocked = saving(storage); blocked.state.favorites.push(item); blocked.save(); blocked.sync(); assert.equal(blocked.state.favorites.length, 1);
  }
});

function loginPage() {
  const nodes = new Map(); const handlers = new Map(); const calls = []; const destinations = []; let resolve; let reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const accountClient = {
    state: { enabled: true, user: null, phase: 'guest' }, localCount: () => 0,
    login(...args) { calls.push(args); harness.run('renderAccount()'); return pending; },
  };
  const harness = appHarness(source, {
    accountClient, location: { origin: 'https://site.example', pathname: '/video/', hash: '#library', assign: url => destinations.push(url) },
    $: id => {
      if (!nodes.has(id)) nodes.set(id, { classList: { toggle() {}, add() {} }, addEventListener: (type, handler) => handlers.set(id + ':' + type, handler) });
      return nodes.get(id);
    },
  });
  const declaration = source.match(/^let loggingIn = false;$/m); assert.ok(declaration, 'Missing login state initialization'); harness.run(declaration[0]);
  harness.include('renderAccount', 'renderServiceStatus');
  const start = source.indexOf("$('account-login').addEventListener('click',");
  const end = source.indexOf("$('account-sync').addEventListener(", start);
  assert.ok(start >= 0 && end > start, 'Missing account login event boundary'); harness.run(source.slice(start, end));
  harness.run('renderAccount()');
  return { nodes, calls, destinations, accountClient, resolve, reject, render: () => harness.run('renderAccount()'), click: () => handlers.get('account-login:click')() };
}

test('page login remains disabled during account onChange and duplicate clicks start only one login', async () => {
  const view = loginPage(); assert.equal(view.nodes.get('account-login').disabled, false);
  const pending = view.click(); assert.equal(view.calls.length, 1); assert.equal(view.nodes.get('account-login').disabled, true);
  view.render(); assert.equal(view.nodes.get('account-login').disabled, true);
  await view.click(); assert.equal(view.calls.length, 1);
  assert.deepEqual(view.calls[0], ['https://site.example/video/', '#library']);
  view.resolve('https://github.com/login/oauth/authorize'); await pending;
  assert.deepEqual(view.destinations, ['https://github.com/login/oauth/authorize']);
  assert.equal(view.nodes.get('account-login').disabled, true);
});

test('failed page login restores retry controls and retains its error while unavailable login stays disabled', async () => {
  const view = loginPage(); const pending = view.click();
  view.reject(new Error('登录服务暂时不可用')); await pending;
  assert.equal(view.nodes.get('account-login').disabled, false); assert.equal(view.nodes.get('account-status').textContent, '登录服务暂时不可用');
  assert.deepEqual(view.destinations, []);
  await view.click(); assert.equal(view.calls.length, 2); assert.equal(view.nodes.get('account-login').disabled, false);
  view.accountClient.state.enabled = false; view.render(); assert.equal(view.nodes.get('account-login').disabled, true);
  await view.click(); assert.equal(view.calls.length, 2);
});
