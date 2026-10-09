import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as core from '../../source/video/core.js';
import * as playback from '../../source/video/playback.js';
import { createHomeLoader } from '../../source/video/home.js';
import { appHarness } from './fixtures/app-harness.cjs';

const source = await readFile(new URL('../../source/video/app.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const episode = number => ({ name: '第' + number + '集', url: 'https://example.com/' + number + '.mp4' });
const film = { uid: 'liangzi:12', source: 'liangzi', id: '12', title: '测试剧', year: '2026', category: '国产剧', lines: [{ name: '完整线', episodes: [1, 2, 3].map(episode) }, { name: '缺第2集', episodes: [1, 3].map(episode) }] };

test('source capability notices distinguish validation from an unavailable public search', () => {
  const harness = appHarness(source, {}); harness.include('sourceSearchNotice', 'renderServiceStatus');
  assert.equal(harness.run('sourceSearchNotice({id:"auete"})'), '搜索要求验证');
  assert.equal(harness.run('sourceSearchNotice({id:"diyi"})'), '源站未开放搜索');
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
