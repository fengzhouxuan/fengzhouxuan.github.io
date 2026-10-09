import {
  SOURCES, CATEGORIES, videoKey, parseRoute, filterVideos, episodeRanges, supportsSource, sourceLabel, requestEpisode,
  safeURL, groupVideos, plainText, nextEpisode, requestVideos, releaseSchedule,
  loadSaved, saveItems, mergeSavedItems, rememberProgress, createListNavigation,
} from './core.js';
import { createCatalogLoader, catalogSummary } from './catalog.js';
import { createHomeLoader, requestHomeSources } from './home.js';
import { sameFavorite, snapshotFavorite, favoriteSummary, acknowledgeFavorite, createWatchlistRefresher } from './watchlist.js';
import { createPlaybackFallback, createPlaybackMonitor, createVariantDiscovery, createPlaybackIntent, resolvePlaybackSelection, resumePosition, playbackSummary, screenPresentation, playbackQuality, matchingEpisode, matchingLine } from './playback.js';
import { createPlaybackExperience, createSourceHealth } from './experience.js';
import { createBackendTransport } from './resilience.js';
import { createAccountClient } from './account.js';
import { favoriteStorageKey } from './favorites.js';

const $ = id => document.getElementById(id);
const config = window.VIDEO_CONFIG || {};
const sourceName = id => SOURCES.find(item => item.id === id)?.name || id;
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let navigationStorage;
try { navigationStorage = window.sessionStorage; } catch { navigationStorage = null; }
const listNavigation = createListNavigation(navigationStorage);
const sourceHealth = createSourceHealth({ storage });
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
const state = {
  route: { view: '' }, lastList: listNavigation.get(), hero: '', home: null,
  catalog: null,
  history: loadSaved(storage, 'video-history'), favorites: loadSaved(storage, 'video-favorites'), account: null,
  watchlist: null, favoritesDirty: false, favoriteFilter: 'all',
  health: new Map(), current: null, group: null, detailVersion: 0, detailLoading: false,
  line: 0, episode: -1, range: 0, reverse: false, hls: null, switching: true,
  pendingResume: 0, resumeSeekTarget: null, lastSave: 0, playbackVersion: 0, resumeOverride: null, monitorTimer: null, playbackPhase: '', resolveController: null,
  discovering: false, autoBusy: false, autoPending: null, autoController: null, autoLoading: false, autoResume: false, localRecovery: false, autoplayBlocked: false, userPaused: false, requestedPlay: false,
  initialPlayback: false, frameCallback: null, frameCallbackSupported: false, lastExperienceRender: 0,
  restorePlaybackIntent: false, manualRetryBusy: false,
};
const video = $('video');
const catalogLoader = createCatalogLoader({ request, onChange: renderCatalog });
state.catalog = catalogLoader.state;
const homeLoader = createHomeLoader({ request: homeRequest, onChange: () => { if (state.route.view === 'home') renderHome(); } });
state.home = homeLoader.state;
const watchlistRefresher = createWatchlistRefresher({ request, onUpdate: updateTrackedFavorite, onChange: () => {
  if (!state.watchlist.loading && state.favoritesDirty) { save('video-favorites', state.favorites); state.favoritesDirty = false; }
  if (state.route.view === 'library') renderLibrary();
} });
state.watchlist = watchlistRefresher.state;
const playbackExperience = createPlaybackExperience({ storage });
const playbackFallback = createPlaybackFallback({ priority: playbackExperience.priority });
const playbackMonitor = createPlaybackMonitor();
const variantDiscovery = createVariantDiscovery({ request, onChange: renderVariantDiscovery });
const playbackIntent = createPlaybackIntent(navigationStorage);
let toastTimer; let filterTimer;
const cardUpdates = new WeakMap();
const continueUpdates = new WeakMap();
const favoriteUpdates = new WeakMap();
const savedBaselines = { 'video-history': JSON.parse(JSON.stringify(state.history)), 'video-favorites': JSON.parse(JSON.stringify(state.favorites)) };
let lastProgressSample = '';
let heroPoster;
let fullscreenFocus;
let submittedSearchHash = '';
let accountClient;
let loggingIn = false;
const backendTransport = createBackendTransport({ base: config.apiBase || '', storage, onChange: renderServiceStatus });
const accountTransport = config.accountApiBase && config.accountApiBase !== config.apiBase ? createBackendTransport({ base: config.accountApiBase, storage }) : backendTransport;
accountClient = createAccountClient({
  base: config.accountApiBase || config.apiBase || '', storage, tabStorage: navigationStorage, fetchImpl: accountTransport.fetch,
  onChange: renderAccount,
  onScope(value) {
    state.favoritesDirty = false;
    if (state.watchlist.loading) watchlistRefresher.stop();
    Object.assign(state.watchlist, { loading: false, completed: 0, total: 0, failed: [], stopped: false });
    state.account = value.user; state.favorites = value.items;
    savedBaselines['video-favorites'] = JSON.parse(JSON.stringify(state.favorites)); renderSavedRecords();
  },
  onFavorites(items) {
    state.favorites = items; savedBaselines['video-favorites'] = JSON.parse(JSON.stringify(items)); renderSavedRecords();
  },
  onCallback(hash) { window.history.replaceState(null, '', location.pathname + location.search + hash); $('account-panel').open = true; },
});

function el(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function button(text, className, action) {
  const item = el('button', className, text);
  item.type = 'button'; item.addEventListener('click', action);
  return item;
}

function toast(message, undo) {
  $('toast').replaceChildren(el('span', '', message)); $('toast').hidden = false;
  if (undo) $('toast').append(button('撤销', 'toast-undo', () => { undo(); $('toast').hidden = true; }));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, undo ? 10000 : 3500);
}

function save(key, items) {
  const property = key === 'video-history' ? 'history' : 'favorites';
  const storageKey = key === 'video-favorites' ? favoriteStorageKey(state.account) : key;
  try {
    const latest = loadSaved(storage, storageKey, savedBaselines[key]);
    const merged = mergeSavedItems(savedBaselines[key], items, latest);
    state[property] = merged;
    const successful = saveItems(storage, storageKey, merged);
    savedBaselines[key] = JSON.parse(JSON.stringify(successful ? merged : latest));
    if (key === 'video-favorites') accountClient?.changed(merged);
    if (!successful) toast('浏览器无法保存记录；收藏与进度会保留在本次打开的页面中。');
  } catch { toast('记录暂时无法保存，本次打开仍可正常观看。'); }
}

function syncSavedRecords() {
  let changed = false;
  for (const [key, property] of [['video-history', 'history'], ['video-favorites', 'favorites']]) {
    const latest = loadSaved(storage, key === 'video-favorites' ? favoriteStorageKey(state.account) : key, savedBaselines[key]);
    const merged = mergeSavedItems(savedBaselines[key], state[property], latest);
    const different = JSON.stringify(state[property]) !== JSON.stringify(merged); changed ||= different;
    state[property] = merged; savedBaselines[key] = JSON.parse(JSON.stringify(latest));
    if (different && key === 'video-favorites') accountClient?.changed(merged);
  }
  return changed;
}

function renderSavedRecords() {
  updateCounts(); updateFavoriteButtons();
  if (state.route.view === 'home') renderHome();
  else if (state.route.view === 'library') renderLibrary();
  else if (['browse', 'search'].includes(state.route.view)) renderCatalog();
  else if (state.route.view === 'detail' && state.current) {
    const progress = progressFor(state.current);
    $('detail-play').textContent = progress ? '▶ 继续观看' : '▶ 开始观看';
    $('detail-progress').textContent = progress ? '上次看到 ' + (progress.playbackLabel || progress.episode) + ' · ' + minuteLabel(progress.position) : '';
  }
}

function favoriteFor(item) {
  return Boolean(item && state.favorites.some(saved => videoKey(saved) === videoKey(item)));
}

function renderAccount(value = accountClient?.state) {
  if (!value) return;
  const loggedIn = Boolean(value.user);
  $('account-label').textContent = loggedIn ? value.user.login : '登录同步';
  $('account-heading').textContent = loggedIn ? value.user.login + ' 的收藏' : '让收藏跟着你走';
  const status = value.message || (!loggedIn ? value.enabled === false ? '账号同步正在准备中；本地收藏可以正常使用。' : '使用受邀的 GitHub 账号登录后，可在不同电脑同步收藏。'
    : value.phase === 'syncing' ? '正在同步收藏…' : value.pending ? '有收藏等待同步，已保留在本机。' : value.lastSync ? '收藏已同步 · ' + new Date(value.lastSync).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '收藏保留在本机，点击同步获取云端片单。');
  $('account-status').textContent = status;
  $('account-status').classList.toggle('error', ['offline', 'expired', 'error'].includes(value.phase));
  $('account-login').hidden = loggedIn && value.phase !== 'expired'; $('account-login').disabled = value.enabled === false || loggingIn;
  $('account-login').textContent = value.phase === 'expired' ? '重新用 GitHub 登录' : 'GitHub 登录';
  $('account-sync').hidden = !loggedIn; $('account-sync').disabled = value.phase === 'syncing' || value.phase === 'expired';
  $('account-sync').textContent = value.phase === 'syncing' ? '正在同步…' : '立即同步';
  $('account-logout').hidden = !loggedIn;
  const local = accountClient?.localCount() || 0;
  $('account-import').hidden = !loggedIn || !local; $('account-import').textContent = '导入本机收藏（' + local + ' 部）';
  $('library-sync-note').textContent = loggedIn ? status + ' 观看记录仅保存在本机。' : '收藏目前保存在本机；登录后可以同步，观看记录仍留在本机。';
}

function sourceSearchNotice(source) {
  return source.id === 'auete' ? '搜索要求验证' : '源站未开放搜索';
}

function renderServiceStatus(value) {
  $('service-notice').hidden = value.phase === 'ready';
  $('service-message').textContent = value.phase === 'limited' ? '查询服务今日额度已用完。正在尝试直连部分来源，并保留缓存目录与本地收藏；云端收藏同步恢复后再继续。'
    : '查询服务暂时不可用，可能是网络或服务额度限制。部分来源可直连，缓存目录与本地收藏仍可使用；云端同步稍后再继续。';
}

function progressFor(item) {
  return item && state.history.find(saved => videoKey(saved) === videoKey(item));
}

function minuteLabel(position) {
  const minutes = Math.floor(Math.max(0, Number(position) || 0) / 60);
  return minutes ? minutes + ' 分钟' : '刚刚开始';
}

function filmRoute(view, item, episode, episodeName = item.lines?.[0]?.episodes[episode]?.name) {
  const params = new URLSearchParams({ source: item.source, id: item.id });
  if (episode !== undefined) params.set('episode', String(episode + 1));
  const name = plainText(episodeName);
  if (view === 'watch' && name && name.length <= 120) params.set('name', name);
  return '#' + view + '?' + params;
}

function navigate(hash) {
  if (location.hash === hash) handleRoute(); else location.hash = hash;
}

function toggleFavorite(item) {
  if (!item) return;
  syncSavedRecords();
  if (favoriteFor(item)) {
    state.favorites = state.favorites.filter(saved => videoKey(saved) !== videoKey(item));
    toast('已取消收藏');
  } else {
    state.favorites.unshift(snapshotFavorite(item));
    state.favorites = state.favorites.slice(0, 100);
    toast('已加入收藏');
  }
  save('video-favorites', state.favorites); updateCounts(); updateFavoriteButtons();
  if (state.route.view === 'home') renderHome();
  if (state.route.view === 'library') renderLibrary();
  if (['browse', 'search'].includes(state.route.view)) renderCatalog();
}

function updateCounts() {
  $('favorite-count').textContent = String(state.favorites.length);
  $('history-count').textContent = String(groupVideos(state.history).length);
}

function updateFavoriteButtons() {
  for (const id of ['detail-favorite', 'favorite-current']) {
    $(id).textContent = favoriteFor(state.current) ? '✓ 已收藏' : '＋ 收藏';
    $(id).setAttribute('aria-pressed', String(favoriteFor(state.current)));
    $(id).disabled = !state.current || state.detailLoading;
  }
}

function addPoster(container, item, loading = 'lazy') {
  container.replaceChildren();
  const fallback = el('span', 'poster-fallback', item.title);
  container.append(fallback);
  if (!safeURL(item.poster)) return;
  const img = document.createElement('img');
  img.src = safeURL(item.poster); img.alt = ''; img.loading = loading; img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => { fallback.hidden = true; }, { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
  container.append(img);
}

function renderCard(item, { history = false } = {}) {
  const card = el('article', 'movie-card');
  const poster = el('a', 'poster-button'); const badge = el('span', 'card-badge');
  const track = el('span', 'progress-track'); const fill = el('span', 'progress-fill'); track.append(fill);
  const title = el('h3'); const link = el('a'); title.append(link);
  const metadata = el('p', 'card-meta'); const sources = el('span', 'secondary');
  const bottom = el('div', 'card-bottom');
  const favorite = button('', '', () => toggleFavorite(item));
  bottom.append(sources, favorite); card.append(poster, title, metadata, bottom);
  let lastPoster; let watch;
  if (history) {
    const actions = el('div', 'saved-actions');
    watch = el('a', 'text-button', '继续观看');
    actions.append(watch, button('移除记录', 'text-button', () => {
      const removed = state.history.filter(saved => videoKey(saved) === videoKey(item));
      state.history = state.history.filter(saved => videoKey(saved) !== videoKey(item));
      save('video-history', state.history); updateCounts(); renderLibrary();
      toast('已移除观看记录', () => {
        state.history = [...state.history, ...removed].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        save('video-history', state.history); updateCounts(); renderLibrary();
      });
    })); card.append(actions);
  }
  function update(next) {
    item = next; const progress = progressFor(item); const saved = favoriteFor(item);
    const posterKey = item.title + '|' + safeURL(item.poster);
    if (lastPoster !== posterKey) { addPoster(poster, item); poster.append(badge, track); lastPoster = posterKey; }
    poster.href = link.href = filmRoute('detail', item); poster.setAttribute('aria-label', '影片详情：' + item.title);
    badge.textContent = history && progress ? (progress.playbackLabel || progress.episode) + ' · ' + minuteLabel(progress.position) : item.remarks || item.category || '影片详情';
    track.hidden = !(progress?.duration > 0);
    fill.style.width = (progress?.duration > 0 ? Math.min(100, Math.max(0, progress.position / progress.duration * 100)) : 0) + '%';
    link.textContent = item.title; metadata.textContent = [item.year, item.area, item.category].filter(Boolean).join(' · ');
    sources.textContent = item.variants.length > 1 ? item.variants.length + ' 个来源' : sourceName(item.source);
    favorite.textContent = saved ? '♥' : '♡'; favorite.className = saved ? 'saved' : '';
    favorite.setAttribute('aria-label', (saved ? '取消收藏' : '收藏') + item.title); favorite.setAttribute('aria-pressed', String(saved));
    if (watch) watch.href = filmRoute('watch', progress || item);
  }
  card.dataset.key = videoKey(item); cardUpdates.set(card, update); update(item);
  return card;
}

function renderGrid(id, videos, options) {
  const grid = $(id); const existing = new Map([...grid.children].map(card => [card.dataset.key, card]));
  const cards = groupVideos(videos).map(item => {
    const card = existing.get(videoKey(item));
    if (card && cardUpdates.has(card)) { cardUpdates.get(card)(item); return card; }
    return renderCard(item, options);
  });
  const retained = new Set(cards);
  for (const card of [...grid.children]) if (!retained.has(card)) card.remove();
  cards.forEach((card, index) => { if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null); });
}

function skeletonCards() {
  return Array.from({ length: 6 }, () => {
    const card = el('div', 'card skeleton'); card.setAttribute('aria-hidden', 'true');
    card.append(el('div', 'poster'), el('div', 'skeleton-title'), el('div', 'skeleton-meta')); return card;
  });
}

function heroVideo() {
  const picks = groupVideos(state.home.picks);
  return picks.find(item => videoKey(item) === state.hero) || picks[0];
}

function renderHero() {
  const picks = groupVideos(state.home.picks); const item = heroVideo();
  $('hero-play').disabled = !item; $('hero-detail').disabled = !item;
  if (!item) {
    $('hero-description').textContent = state.home.sections.picks.loading ? '正在准备今天的放映室…' : '试试搜索片名，或从下面的分类开始挑选。';
    return;
  }
  if (!state.hero) state.hero = videoKey(item);
  $('hero-title').textContent = item.title;
  $('hero-meta').textContent = '经典重温 / ' + [item.year, item.category, item.remarks].filter(Boolean).join(' · ');
  $('hero-description').textContent = item.description || '选一部熟悉的故事，从这一幕开始。';
  const posterKey = videoKey(item) + '|' + safeURL(item.poster);
  if (heroPoster !== posterKey) {
    addPoster($('hero-art'), item, 'eager'); $('hero-art').append(el('span', 'film-corner', 'SIDE B / CINEMA')); heroPoster = posterKey;
  }
  const group = $('hero-picks'); const existing = new Map([...group.children].map(option => [option.dataset.key, option]));
  const focused = group.contains(document.activeElement) ? document.activeElement : null;
  const options = picks.map((pick, index) => {
    const key = videoKey(pick); const selected = key === videoKey(item);
    const option = existing.get(key) || button('', '', () => { state.hero = key; renderHero(); });
    option.dataset.key = key; option.textContent = '0' + (index + 1) + '  ' + pick.title;
    option.classList.toggle('active', selected); option.setAttribute('aria-pressed', String(selected));
    option.tabIndex = (focused ? option === focused : selected) ? 0 : -1; return option;
  });
  const retained = new Set(options);
  for (const option of [...group.children]) if (!retained.has(option)) option.remove();
  options.forEach((option, index) => { if (group.children[index] !== option) group.insertBefore(option, group.children[index] || null); });
}

function renderHome() {
  renderHero();
  for (const section of ['picks', 'short', 'tv', 'movie']) {
    const grid = $(section + '-cards'); const status = state.home.sections[section];
    const statusFocused = document.activeElement === $(section + '-status');
    const items = groupVideos(state.home[section]).slice(0, 6);
    if (!items.length && status.loading) {
      if (!grid.querySelector('.skeleton')) grid.replaceChildren(...skeletonCards());
    } else renderGrid(section + '-cards', items);
    grid.setAttribute('aria-busy', String(status.loading));
    const message = status.loading ? (items.length ? '已返回的影片可以先看，其他条目仍在查询…' : '正在加载影片…')
      : status.failed ? (items.length ? '部分条目暂时无法读取，已显示的影片可以正常查看。' : '这个栏目暂时无法读取，请稍后重试。')
      : !items.length ? '本次查询暂无影片，可以重试或搜索片名。' : status.empty ? '部分精选影片暂未找到，可以重试。' : '';
    $(section + '-status').textContent = message;
    const retry = $(section + '-retry'); const wasFocused = document.activeElement === retry;
    if (!status.loading) retry.hidden = !status.failed && !status.empty;
    retry.disabled = status.loading;
    retry.textContent = status.loading ? '正在重试…' : '重试这个栏目';
    if (wasFocused && (retry.hidden || retry.disabled)) { $(section + '-status').focus({ preventScroll: true }); }
    else if (statusFocused && !message) grid.querySelector('.poster-button')?.focus({ preventScroll: true });
  }
  $('home-status').textContent = state.home.loading ? '正在布置放映室，已返回的影片可以先看。' : '';
  const records = groupVideos(state.history).slice(0, 3);
  $('continue-section').hidden = !records.length;
  const grid = $('continue-cards'); const existing = new Map([...grid.children].map(card => [card.dataset.key, card]));
  const cards = records.map(item => {
    const key = videoKey(item); let card = existing.get(key);
    if (!card) {
      card = el('a', 'continue-card'); card.dataset.key = key;
      const cover = el('div', 'continue-cover'); const copy = el('div');
      const title = el('strong'); const progress = el('small'); let posterKey;
      copy.append(title, progress, el('span', '', '继续观看 →')); card.append(cover, copy);
      continueUpdates.set(card, next => {
        const poster = next.title + '|' + safeURL(next.poster);
        if (posterKey !== poster) { addPoster(cover, next); posterKey = poster; }
        card.href = filmRoute('watch', next); title.textContent = next.title;
        progress.textContent = (next.playbackLabel || next.episode) + ' · 已看到 ' + minuteLabel(next.position);
      });
    }
    continueUpdates.get(card)(item); return card;
  });
  const retained = new Set(cards);
  for (const card of [...grid.children]) if (!retained.has(card)) card.remove();
  cards.forEach((card, index) => { if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null); });
}

function renderSources() {
  $('source-info').replaceChildren(...SOURCES.map(source => {
    const item = el('div'); item.append(el('strong', '', source.name), el('small', '', source.search === false ? '分类浏览与播放 · ' + sourceSearchNotice(source) : source.browseTypes?.length === 0 ? '搜索与播放 · 聚合结果按上游去重' : '搜索、支持的分类与播放'), el('small', '', state.health.get(source.id) || '本次尚未查询'));
    for (const [operation, label] of [['search', '搜索'], ['browse', '分类']]) {
      const value = sourceHealth.profile(source.id, operation);
      if (!value.observed) continue;
      const message = value.cooldownMs ? '暂时避开 · 约 ' + Math.ceil(value.cooldownMs / 60000) + ' 分钟后可再次自动查询，可手动重试'
        : value.failures ? '最近连接失败，下次查询可再次尝试' : '近期查询约 ' + (value.latencyMs / 1000).toFixed(1) + ' 秒';
      item.append(el('small', '', label + '：' + message));
    }
    return item;
  }));
}

async function request(source, options = {}) {
  const operation = options.id ? 'detail' : options.mode === 'browse' ? 'browse' : 'search';
  if (operation !== 'detail' && !options.retrySources && sourceHealth.profile(source, operation).cooldownMs) {
    const error = new Error('这个来源最近连接失败，已暂时避开；可以手动重试'); error.name = 'SourceCooldownError'; throw error;
  }
  const ticket = sourceHealth.begin(source, operation);
  const started = performance.now();
  try {
    const response = await requestVideos(source, { ...options, base: config.apiBase || '', fetchImpl: backendTransport.fetch });
    sourceHealth.finish(ticket, { successful: true, elapsedMs: performance.now() - started, ignored: response.degraded === 'cache' || options.signal?.aborted || document.hidden || navigator.onLine === false });
    state.health.set(source, response.degraded === 'cache' ? '正在使用已缓存目录，更新时间可能延迟' : response.degraded === 'direct' ? '浏览器直连目录成功' : '目录查询成功 · ' + ((performance.now() - started) / 1000).toFixed(1) + ' 秒');
    renderSources(); return response;
  } catch (error) {
    sourceHealth.finish(ticket, { successful: false, elapsedMs: performance.now() - started, ignored: error.name === 'QueryServiceError' || error.name === 'AbortError' || options.signal?.aborted || document.hidden || navigator.onLine === false });
    if (error.name !== 'AbortError') state.health.set(source, error.name === 'QueryServiceError' ? '查询服务暂时无法连接，可重试' : '目录查询失败，可切换其他来源');
    renderSources(); throw error;
  }
}

async function homeRequest(options) {
  const route = options.mode === 'browse' ? { view: 'browse', type: options.type ?? CATEGORIES.find(cat => cat.id === options.category).types[0][0] } : { view: 'search' };
  const sources = sourceHealth.order(SOURCES.filter(item => supportsSource(item, route)).map(source => source.id), route.view, { retry: options.retrySources });
  return requestHomeSources(sources, options, request);
}

function resetFilters() {
  clearTimeout(filterTimer); catalogLoader.setFilters();
  for (const key of ['year', 'area', 'status']) $(key + '-filter').scrollLeft = 0;
}

function selectFilter(key, value, focus = true) {
  clearTimeout(filterTimer); catalogLoader.setFilters({ ...state.catalog.filters, [key]: value });
  if (focus) [...$(key + '-filter').children].find(item => item.dataset.value === value)?.focus();
  filterTimer = setTimeout(() => catalogLoader.fill(), 300);
}

function clearFilter(key) {
  const chips = $('selected-filters'); const index = [...chips.children].findIndex(chip => chip.dataset.filter === key);
  selectFilter(key, '', false);
  (chips.children[Math.min(index, chips.children.length - 1)] || $('filter-toggle')).focus({ preventScroll: true });
}

function renderFilters() {
  const filters = state.catalog.filters;
  const focus = document.activeElement;
  const focusedFilter = focus?.parentElement?.classList.contains('filter-options') ? { id: focus.parentElement.id, value: focus.dataset.value } : null;
  const focusedSelected = focus?.classList.contains('selected-filter') ? focus.dataset.filter : '';
  const recentYears = Array.from({ length: 10 }, (_, index) => String(new Date().getFullYear() - index));
  const years = [...new Set([...recentYears, ...state.catalog.items.map(item => item.year).filter(Boolean)])].sort().reverse();
  if (filters.year && !years.includes(filters.year)) years.unshift(filters.year);
  const groups = [
    ['year', '年份', years.map(year => [year, year])],
    ['area', '地区', [['mainland', '大陆'], ['hk', '港台'], ['japan', '日本'], ['korea', '韩国'], ['west', '欧美']]],
    ['status', '状态', [['updating', '更新中'], ['complete', '已完结 / 完整版']]],
  ];
  const selected = [];
  for (const [key, label, options] of groups) {
    $(key + '-filter').replaceChildren(...[['', '全部'], ...options].map(([value, name]) => {
      const active = filters[key] === value;
      const chip = button(name, 'filter-chip' + (active ? ' active' : ''), () => selectFilter(key, active ? '' : value));
      chip.dataset.value = value;
      chip.setAttribute('aria-label', label + '：' + name);
      chip.setAttribute('aria-pressed', String(active));
      chip.tabIndex = (focusedFilter?.id === key + '-filter' ? focusedFilter.value === value : active) ? 0 : -1;
      return chip;
    }));
    const option = options.find(([value]) => value === filters[key]);
    if (option) {
      const chip = button(option[1] + ' ×', 'selected-filter', () => clearFilter(key)); chip.dataset.filter = key;
      chip.setAttribute('aria-label', '清除' + label + '：' + option[1]);
      selected.push(chip);
    }
  }
  $('selected-filters').replaceChildren(...selected);
  $('filter-summary').hidden = !selected.length;
  $('filter-toggle').textContent = selected.length ? '筛选 · ' + selected.length : '筛选';
  $('reset-filters').disabled = !selected.length;
  if (focusedFilter) [...$(focusedFilter.id).children].find(item => item.dataset.value === focusedFilter.value)?.focus({ preventScroll: true });
  if (focusedSelected) [...$('selected-filters').children].find(item => item.dataset.filter === focusedSelected)?.focus({ preventScroll: true });
}

function renderCatalog() {
  if (!['browse', 'search'].includes(state.route.view)) return;
  const focusedControl = ['pause-catalog', 'load-more'].includes(document.activeElement?.id) ? document.activeElement : null;
  const route = state.route; const cat = CATEGORIES.find(item => item.id === route.category);
  document.querySelectorAll('.source-picks input').forEach(input => {
    const source = SOURCES.find(item => item.id === input.value);
    input.disabled = !supportsSource(source, route);
    input.parentElement.classList.toggle('unavailable-source', input.disabled);
    input.parentElement.title = input.disabled ? (source.search === false && route.view === 'search' ? sourceSearchNotice(source) + '，可从分类浏览进入' : source.search === false ? '不支持当前细分类别，可选择其他分类或来源' : '不支持当前细分类别，可在搜索中使用') : '';
  });
  $('library-title').textContent = route.view === 'search' ? '“' + route.query + '”的搜索结果' : route.category === 'short' && route.type === 52 ? 'AI漫剧' : cat.name;
  $('category-note').hidden = route.view !== 'browse' || route.category !== 'short';
  $('category-note').textContent = route.type === 52 ? '按支持此分类的来源浏览 AI 漫剧，作品归类以来源标注为准。' : '按来源短剧目录浏览，也可以切换到 AI 漫剧。';
  $('catalog-eyebrow').textContent = route.view === 'search' ? 'FIND YOUR NEXT STORY' : 'EXPLORE THE SHELF';
  $('type-picks').hidden = route.view === 'search';
  $('type-picks').parentElement.classList.toggle('search-filters', route.view === 'search');
  $('type-picks').replaceChildren(...cat.types.map(([id, name]) => {
    const b = button(name, route.type === id ? 'active' : '', () => navigate('#browse?category=' + cat.id + '&type=' + id));
    b.setAttribute('aria-pressed', String(route.type === id)); return b;
  }));
  renderFilters();
  const items = filterVideos(state.catalog.items, state.catalog.filters);
  const progress = catalogSummary(state.catalog);
  $('result-count').textContent = progress.count + ' 部' + (progress.filtered ? '匹配' : '') + ' · 已查 ' + progress.queried + ' 页';
  renderGrid('cards', items);
  $('cards').setAttribute('aria-busy', String(state.catalog.loading));
  if (state.catalog.loading && !items.length) $('cards').replaceChildren(...skeletonCards());
  $('catalog-empty').hidden = Boolean(progress.count) || state.catalog.loading;
  const messages = {
    loading: progress.count ? (state.catalog.restoring ? '正在恢复目录，已返回的影片可以先看…' : '已显示返回的影片，其他来源仍在查询…') : (state.catalog.restoring ? '正在恢复上次浏览的目录…' : '正在查询目录…'), scanning: '正在补查匹配影片…', paused: '查询已暂停，可继续查询剩余目录。',
    failed: progress.serviceFailed.length === state.catalog.feeds.length ? '查询服务暂时无法连接，请重试查询。' : progress.failed.map(sourceName).join('、') + '查询未完成，可继续查询重试。',
    deferred: progress.deferred.map(sourceName).join('、') + '最近连接失败，已暂时避开；可继续查询立即重试。',
    partial: progress.filtered ? '还有目录未查完，可继续查找匹配影片。' : '还有更多影片可以浏览。',
    limited: '已达到本次查询上限，可换片名搜索更多影片。', complete: '所选来源本次返回的目录已查完。',
  };
  $('search-status').textContent = messages[progress.phase];
  $('search-status').classList.toggle('error', Boolean(progress.failed.length));
  const scope = ['查询进度 ' + progress.queried + ' / ' + progress.total + ' 页'];
  if (progress.limited) scope.push('每个来源最多查询 20 页');
  if (progress.missingMetadata) scope.push('部分影片缺少筛选信息，结果可能不完整');
  if (progress.deferred.length && progress.phase !== 'deferred') scope.push(progress.deferred.map(sourceName).join('、') + '暂时避开，可继续查询重试');
  $('catalog-scope').textContent = scope.join(' · ');
  $('catalog-progress').max = Math.max(1, progress.total); $('catalog-progress').value = progress.queried;
  $('pause-catalog').hidden = !state.catalog.loading;
  const unavailable = !progress.queried && Boolean(progress.failed.length || progress.deferred.length);
  $('catalog-empty-title').textContent = unavailable ? '这次查询未成功' : progress.hasMore ? '还没有匹配，目录尚未查完' : '本次已查目录中暂无匹配影片';
  $('catalog-empty-hint').textContent = unavailable ? '暂时无法判断有没有资源，请重试查询。' : progress.hasMore ? '继续查询剩余目录，或调整筛选条件。' : '试试调整筛选或搜索片名；这不代表其他来源也没有资源。';
  $('load-more').hidden = !progress.hasMore;
  $('load-more').disabled = state.catalog.loading;
  $('load-more').textContent = state.catalog.loading ? '正在查询…' : unavailable ? '重试查询' : progress.filtered || progress.failed.length || progress.deferred.length ? '继续查询' : '加载更多影片';
  if (focusedControl && (focusedControl.hidden || focusedControl.disabled)) {
    const target = state.catalog.loading ? $('pause-catalog') : !progress.hasMore ? $('filter-toggle') : $('load-more');
    target.focus({ preventScroll: true });
  }
}

function visibleCardAnchor(cards) {
  const focused = document.activeElement; const active = focused?.closest('.movie-card, .continue-card');
  const visible = card => { const rect = card.getBoundingClientRect(); return rect.bottom > 0 && rect.top < window.innerHeight; };
  const anchor = cards.includes(active) && visible(active) ? active : cards.find(visible);
  return anchor ? {
    key: anchor.dataset.key, offset: anchor.getBoundingClientRect().top,
    focus: anchor === active ? (focused.classList.contains('continue-card') ? 'continue' : focused.classList.contains('poster-button') ? 'poster' : focused.tagName === 'BUTTON' ? 'favorite' : 'title') : '',
    section: anchor.parentElement.id.replace('-cards', ''),
  } : null;
}

function rememberHomePosition() {
  const cards = [...document.querySelectorAll('#home-page .movie-card, #home-page .continue-card')];
  return listNavigation.rememberHome({
    top: window.scrollY, hero: state.hero, control: document.activeElement?.id,
    anchor: visibleCardAnchor(cards),
  });
}

function restoreListPosition(restore, container) {
  const anchor = restore.anchor && [...container.children].find(card => card.dataset.key === restore.anchor.key);
  const top = anchor ? Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - restore.anchor.offset) : restore.top;
  window.scrollTo({ top, behavior: 'instant' });
  const selector = { poster: '.poster-button', title: 'h3 a', favorite: '.card-bottom button' }[restore.anchor?.focus];
  if (anchor && restore.anchor.focus === 'continue') anchor.focus({ preventScroll: true });
  else if (anchor && selector) anchor.querySelector(selector)?.focus({ preventScroll: true });
  else if (restore.control) $(restore.control)?.focus({ preventScroll: true });
}

function rememberCatalogPosition() {
  return listNavigation.rememberCatalog(state.lastList, {
    filters: state.catalog.filters, top: window.scrollY, expanded: $('catalog-filters').open,
    anchor: visibleCardAnchor([...$('cards').children]),
    pages: catalogSummary(state.catalog).pages,
    sources: [...document.querySelectorAll('.source-picks input:checked')].map(input => input.value),
  });
}

async function loadCatalog({ more = false, force = false, restore = null, retrySources = false } = {}) {
  const route = state.route;
  if (restore && !force) {
    $('catalog-filters').open = restore.expanded;
    if (restore.sources.length) document.querySelectorAll('.source-picks input').forEach(input => { input.checked = restore.sources.includes(input.value); });
  }
  const selected = [...document.querySelectorAll('.source-picks input:checked:not(:disabled)')].map(item => item.value);
  const sources = sourceHealth.order(selected, route.view, { retry: true });
  if (!sources.length) { toast('至少选择一个查询来源'); return; }
  if (route.view === 'search' && !route.query) { $('query').focus(); return; }
  if (more) return catalogLoader.more();
  const previousKey = state.catalog.key;
  const pending = catalogLoader.open({ sources, mode: route.view === 'browse' ? 'browse' : '', category: route.category, type: route.type, query: route.query }, { force, filters: restore?.filters || (force ? state.catalog.filters : undefined), pages: restore?.pages, retrySources: force || retrySources });
  if (force || previousKey !== state.catalog.key) for (const key of ['year', 'area', 'status']) $(key + '-filter').scrollLeft = 0;
  return pending;
}

function renderLibrary() {
  const history = state.route.tab === 'history';
  $('favorites-tab').classList.toggle('active', !history); $('history-tab').classList.toggle('active', history);
  const items = history ? state.history : state.favorites;
  const updates = state.favorites.filter(item => favoriteSummary(item, state.history).hasNew);
  $('favorite-tools').hidden = history;
  $('favorites-new').textContent = '有新集 ' + updates.length;
  for (const filter of ['all', 'new']) {
    const b = $('favorites-' + filter); b.classList.toggle('active', state.favoriteFilter === filter); b.setAttribute('aria-pressed', String(state.favoriteFilter === filter));
  }
  $('refresh-favorites').disabled = state.watchlist.loading || !state.favorites.length;
  $('refresh-favorites').textContent = state.watchlist.loading ? '正在刷新…' : '刷新更新';
  $('stop-favorites').hidden = !state.watchlist.loading;
  const refresh = state.watchlist;
  $('favorites-status').textContent = refresh.loading ? '正在查询收藏来源 ' + refresh.completed + ' / ' + refresh.total + '…' : refresh.stopped ? '刷新已暂停，已获取的信息已保留。' : refresh.failed.length ? refresh.failed.length + ' 部查询失败，保留上次信息；可以再次刷新重试。' : refresh.total ? '已查询 ' + refresh.completed + ' 部收藏；以所收藏来源的实际剧集为准。' : '点“刷新更新”查看新集；来源缓存最多 5 分钟，关闭页面后不会继续查询。';
  $('favorites-status').classList.toggle('error', Boolean(refresh.failed.length));
  const visible = history || state.favoriteFilter === 'all' ? items : updates;
  $('saved-cards').classList.toggle('watchlist-cards', !history);
  if (history) renderGrid('saved-cards', items, { history });
  else {
    const grid = $('saved-cards'); const existing = new Map([...grid.children].map(card => [card.dataset.key, card]));
    const cards = visible.map(item => {
      const card = existing.get(videoKey(item));
      if (card && favoriteUpdates.has(card)) { favoriteUpdates.get(card)(item); return card; }
      return renderFavorite(item);
    });
    const retained = new Set(cards); const focusedCard = document.activeElement?.closest('.watchlist-card');
    for (const card of [...grid.children]) if (!retained.has(card)) card.remove();
    cards.forEach((card, index) => { if (grid.children[index] !== card) grid.insertBefore(card, grid.children[index] || null); });
    if (focusedCard && !retained.has(focusedCard)) (cards[0]?.querySelector('.watchlist-poster') || $('favorites-all')).focus({ preventScroll: true });
  }
  $('saved-count').textContent = (history ? groupVideos(items).length : visible.length) + ' 部';
  $('saved-empty').hidden = Boolean(visible.length);
  $('saved-empty-title').textContent = history ? '还没有观看记录' : state.favoriteFilter === 'new' && items.length ? '暂未发现新集' : '片单还是空的';
  $('saved-empty-hint').textContent = history ? '看过的影片会留在这里，随时接着看。' : state.favoriteFilter === 'new' && items.length ? '刷新收藏来源后再看看，也可以切回全部收藏。' : '去挑一部想看的故事，点一下收藏。';
}

function updateTrackedFavorite(item) {
  const index = state.favorites.findIndex(saved => sameFavorite(saved, item));
  if (index < 0) return;
  state.favorites[index] = snapshotFavorite(item, state.favorites[index]); state.favoritesDirty = true;
}

function renderFavorite(item) {
  const card = el('article', 'watchlist-card');
  const poster = el('a', 'watchlist-poster'); let posterKey;
  const copy = el('div', 'watchlist-copy');
  const heading = el('div', 'watchlist-heading'); const title = el('h3'); const link = el('a'); const badge = el('span', 'update-badge');
  title.append(link); heading.append(title, badge);
  const metadata = el('p', 'watchlist-meta'); const availability = el('p', 'watchlist-availability'); const progress = el('p', 'watchlist-progress');
  const schedule = el('p', 'watchlist-schedule'); const scheduleText = el('span'); const credit = el('a', '', '排期来源 ↗');
  credit.target = '_blank'; credit.rel = 'noopener noreferrer'; schedule.append(scheduleText, credit);
  const checked = el('p', 'watchlist-checked'); copy.append(heading, metadata, availability, progress, schedule, checked);
  const actions = el('div', 'watchlist-actions');
  const watch = el('a', 'button small'); const details = el('a', 'text-button', '详情');
  const acknowledge = button('已知晓', 'text-button', () => {
    state.favorites = state.favorites.map(saved => saved.uid === item.uid ? acknowledgeFavorite(saved) : saved); save('video-favorites', state.favorites); renderLibrary();
  });
  const remove = button('取消收藏', 'text-button', () => toggleFavorite(item)); actions.append(watch, details, acknowledge, remove);
  copy.append(actions); card.append(poster, copy);
  function update(next) {
    item = next; const summary = favoriteSummary(item, state.history, config.releaseSchedules);
    const image = item.title + '|' + safeURL(item.poster);
    if (posterKey !== image) { addPoster(poster, item); posterKey = image; }
    poster.href = link.href = details.href = filmRoute('detail', item); poster.setAttribute('aria-label', '影片详情：' + item.title);
    link.textContent = item.title; badge.hidden = !summary.hasNew && !summary.unwatched; badge.textContent = summary.hasNew ? '有新集' : '有未看集';
    metadata.textContent = [item.year, item.category, sourceLabel(item)].filter(Boolean).join(' · ');
    availability.textContent = summary.availability;
    progress.textContent = summary.progress ? '上次看到 ' + (summary.progress.playbackLabel || summary.progress.episode) + ' · ' + minuteLabel(summary.progress.position) : '还没开始观看';
    scheduleText.textContent = summary.schedule.label; credit.hidden = !summary.schedule.url; credit.href = summary.schedule.url || '#';
    const failed = state.watchlist.failed.some(value => value.uid === item.uid);
    const time = summary.checkedAt ? new Date(summary.checkedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    checked.classList.toggle('error', failed); checked.textContent = [failed ? '本次查询失败 · 保留上次信息' : time ? '上次查询 ' + time : '尚未刷新来源', summary.comparisonNote].filter(Boolean).join(' · ');
    watch.textContent = summary.progress ? '▶ 继续观看' : '▶ 开始观看'; watch.href = filmRoute('watch', summary.progress || item);
    const acknowledgeFocused = document.activeElement === acknowledge;
    acknowledge.hidden = !summary.hasNew; remove.setAttribute('aria-label', '取消收藏' + item.title);
    if (acknowledgeFocused && acknowledge.hidden) watch.focus({ preventScroll: true });
  }
  card.dataset.key = videoKey(item); favoriteUpdates.set(card, update); update(item); return card;
}

function currentEpisode() {
  return state.current?.lines?.[state.line]?.episodes[state.episode];
}

function renderVariants() {
  for (const id of ['detail-variants', 'variant-buttons']) {
    const variants = state.group?.variants || [];
    const buttons = new Map([...$(id).children].map(value => [value.dataset.uid, value]));
    const retained = new Set();
    for (const variant of variants) {
      const active = variant.uid === state.current?.uid;
      const sameSource = variants.filter(item => item.source === variant.source);
      const label = sourceLabel(variant) + (variant.source !== 'zip0' && sameSource.length > 1 ? ' · 版本 ' + (sameSource.indexOf(variant) + 1) : '');
      let b = buttons.get(variant.uid);
      if (!b) { b = button('', '', () => { if (b.dataset.uid !== state.current?.uid) switchVariant(state.group.variants.find(item => item.uid === b.dataset.uid)); }); b.dataset.uid = variant.uid; $(id).append(b); }
      retained.add(b); b.textContent = label; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
    }
    for (const b of [...$(id).children]) if (!retained.has(b)) { if (document.activeElement === b) [...retained].find(value => value.dataset.uid === state.current?.uid)?.focus({ preventScroll: true }); b.remove(); }
  }
  $('change-source').disabled = !(state.group?.variants.some(item => item.uid !== state.current?.uid));
}

function renderDetail() {
  const item = state.current; if (!item) return;
  $('detail-title').textContent = item.title; addPoster($('detail-poster'), item, 'eager');
  $('detail-meta').textContent = [item.year, item.area, item.category].filter(Boolean).join(' / ');
  $('detail-remarks').textContent = item.remarks || '来源未提供更新状态';
  const schedule = releaseSchedule(item, config.releaseSchedules);
  $('detail-schedule').replaceChildren(el('strong', '', schedule.label));
  if (schedule.credit) {
    const credit = el(schedule.url ? 'a' : 'span', 'schedule-credit', schedule.credit);
    if (schedule.url) { credit.href = schedule.url; credit.target = '_blank'; credit.rel = 'noopener noreferrer'; }
    $('detail-schedule').append(credit);
  }
  $('detail-updates').hidden = false;
  $('detail-updated-row').hidden = !item.updatedAt || item.updatedAt === '0';
  $('detail-updated-at').textContent = item.updatedAt;
  $('detail-schedule-note').textContent = schedule.note;
  $('detail-schedule-note').hidden = !schedule.note;
  const actors = (item.actors || '').split(/[,，、]/).map(name => name.trim()).filter(Boolean);
  $('detail-actors').replaceChildren();
  if (actors.length > 5) {
    const credits = el('details', 'full-credits');
    credits.append(el('summary', '', actors.slice(0, 5).join('、') + ' 等 · 展开名单'), el('p', '', actors.join('、')));
    $('detail-actors').append(credits);
  } else $('detail-actors').textContent = item.actors || '暂无主演信息';
  $('detail-director').textContent = item.director || '暂无导演信息';
  $('detail-description').textContent = item.description || '这个来源暂时没有提供简介。';
  const progress = progressFor(item);
  $('detail-play').textContent = progress ? '▶ 继续观看' : '▶ 开始观看';
  $('detail-play').disabled = state.detailLoading || !item.lines?.length;
  $('detail-progress').textContent = progress ? '上次看到 ' + (progress.playbackLabel || progress.episode) + ' · ' + minuteLabel(progress.position) : '';
  $('detail-back').href = state.lastList;
  const episodes = item.lines?.[0]?.episodes || [];
  const summary = playbackSummary(item);
  $('detail-status').textContent = state.detailLoading ? '正在获取影片信息…' : episodes.length ? summary.label + ' · ' + sourceName(item.source) : '这条来源暂无可直接播放的剧集，请试试其他来源。';
  $('detail-entry-note').textContent = summary.note; $('detail-entry-note').hidden = !summary.note;
  $('detail-episodes').replaceChildren(...episodes.slice(0, 12).map((episode, index) => button(summary.names[index], '', () => navigate(filmRoute('watch', item, index)))));
  if (episodes.length > 12) $('detail-episodes').append(button('全部 ' + episodes.length + ' 集 →', 'all-episodes', () => navigate(filmRoute('watch', item))));
  updateFavoriteButtons(); renderVariants();
}

function renderEpisodes() {
  const focused = document.activeElement;
  const focusedGroup = ['episode-ranges', 'episodes'].includes(focused?.parentElement?.id) ? focused.parentElement.id : '';
  const focusedIndex = focused?.dataset.index;
  const episodes = state.current?.lines?.[state.line]?.episodes || [];
  const summary = playbackSummary(state.current, state.line);
  const ranges = episodeRanges(episodes.length); state.range = Math.min(state.range, Math.max(0, ranges.length - 1));
  $('episode-ranges').hidden = ranges.length < 2;
  $('episode-ranges').replaceChildren(...ranges.map((range, index) => {
    const b = button((range.start + 1) + '–' + range.end, index === state.range ? 'active' : '', () => { state.range = index; renderEpisodes(); });
    b.dataset.index = String(index);
    b.tabIndex = index === (focusedGroup === 'episode-ranges' ? Number(focusedIndex) : state.range) ? 0 : -1;
    b.setAttribute('aria-pressed', String(index === state.range)); return b;
  }));
  const range = ranges[state.range];
  const indices = range ? Array.from({ length: range.end - range.start }, (_, index) => index + range.start) : [];
  if (state.reverse) indices.reverse();
  const focusIndex = focusedGroup === 'episodes' && indices.includes(Number(focusedIndex)) ? Number(focusedIndex) : indices.includes(state.episode) ? state.episode : indices[0];
  $('episodes').replaceChildren(...indices.map(index => {
    const b = button(summary.names[index], index === state.episode ? 'active' : '', () => { saveProgress(); startEpisode(index, 0); });
    b.dataset.index = String(index);
    b.tabIndex = index === focusIndex ? 0 : -1;
    b.setAttribute('aria-pressed', String(index === state.episode)); return b;
  }));
  $('next-episode').disabled = state.episode < 0 || nextEpisode(state.episode, episodes.length) < 0;
  $('previous-episode').disabled = state.episode <= 0;
  $('next-episode').hidden = $('previous-episode').hidden = episodes.length < 2;
  $('reverse-episodes').hidden = episodes.length < 2;
  $('episode-keyboard-hint').hidden = episodes.length < 2;
  $('episode-caption').textContent = summary.names[state.episode] || '';
  $('episode-status').textContent = summary.label + ' · ' + sourceName(state.current?.source || '');
  $('episode-note').textContent = summary.note; $('episode-note').hidden = !summary.note;
  $('episode-heading').textContent = episodes.length < 2 ? '播放来源' : '来源与剧集';
  $('open-episodes').textContent = episodes.length < 2 ? '播放来源 ↓' : '选集 / 来源 ↓';
  $('reverse-episodes').textContent = state.reverse ? '正序' : '倒序';
  $('reverse-episodes').setAttribute('aria-pressed', String(state.reverse));
  if (focusedGroup) {
    const group = $(focusedGroup); const target = !group.hidden && [...group.children].find(item => item.dataset.index === focusedIndex);
    (target || $('episode-heading')).focus({ preventScroll: true });
  } else if (['next-episode', 'previous-episode'].includes(focused?.id) && (focused.hidden || focused.disabled)) $('screen').focus({ preventScroll: true });
}

function destroyPlayback() {
  state.switching = true; state.playbackVersion++;
  playbackExperience.finish();
  if (state.frameCallback !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(state.frameCallback);
  state.frameCallback = null;
  state.resolveController?.abort(); state.resolveController = null;
  clearInterval(state.monitorTimer); state.monitorTimer = null; playbackMonitor.stop(); state.playbackPhase = '';
  state.resumeSeekTarget = null;
  $('screen').classList.remove('resuming'); $('early-switch').hidden = true;
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  qualitySelection = -1; qualityReady = false; qualityNative = false;
  video.pause(); video.removeAttribute('src'); video.load();
  renderQuality();
}

let qualitySelection = -1; let qualityReady = false; let qualityNative = false;
function renderQuality() {
  const hls = state.hls;
  if (hls?.autoLevelEnabled) qualitySelection = -1;
  const summary = playbackQuality(hls?.levels, { selected: qualitySelection, current: hls?.currentLevel, width: state.switching ? 0 : video.videoWidth, height: state.switching ? 0 : video.videoHeight, ready: qualityReady, native: qualityNative, paused: video.paused });
  const select = $('quality-select');
  const options = summary.selectable ? [{ index: -1, label: '自动' }, ...summary.choices] : [];
  const key = JSON.stringify(options.map(option => [option.index, option.label]));
  if (select.dataset.options !== key) {
    select.replaceChildren(...options.map(choice => { const option = el('option', '', choice.label); option.value = String(choice.index); return option; }));
    select.dataset.options = key;
  }
  select.value = String(summary.selected); select.disabled = !summary.selectable;
  $('quality-label').hidden = !summary.selectable;
  $('quality-current').textContent = summary.currentLabel;
  $('quality-note').textContent = summary.note;
  $('quality-source').hidden = !qualityReady || summary.selectable;
  if (!summary.selectable && document.activeElement === select) (qualityReady ? $('quality-source') : $('screen')).focus({ preventScroll: true });
}

function screenMessage(text) {
  $('screen-message').textContent = text; $('screen-message').hidden = !text;
}

function fallbackMessage(text) {
  $('fallback-status').textContent = text; $('fallback-status').hidden = !text;
  $('stop-auto-source').hidden = !state.autoBusy && !state.autoPending && !state.autoLoading;
}

function cancelFallback(message = '') {
  if (state.autoBusy || state.autoPending) { playbackExperience.finish(); renderPlaybackExperience(true); }
  playbackFallback.stop(); state.autoController?.abort(); state.autoController = null;
  state.autoBusy = false; state.autoPending = null; state.autoLoading = false; fallbackMessage(message);
}

function playbackPosition() {
  return state.pendingResume || state.resumeSeekTarget || video.currentTime || (state.current && playbackFallback.state.key === videoKey(state.current) ? playbackFallback.state.position : 0);
}

function renderWatch() {
  const current = state.current;
  $('playing-title').textContent = current.title; $('watch-back').href = filmRoute('detail', current);
  $('watch-list-back').href = state.lastList;
  $('failed-watch-back').href = state.lastList;
  $('video-description').textContent = current.description || '这个来源暂时没有提供简介。';
  $('line-select').replaceChildren(...(current.lines || []).map((line, index) => { const hint = playbackExperience.profile(current, index).label; const o = el('option', '', line.name + (hint ? ' · ' + hint : '')); o.value = String(index); return o; }));
  $('line-select').value = String(state.line); $('line-label').hidden = (current.lines?.length || 0) < 2;
}

function adaptScreen() {
  const presentation = screenPresentation(video.videoWidth, video.videoHeight, $('screen-mode').value);
  $('watch-layout').classList.toggle('portrait', presentation.portrait);
  $('screen').style.setProperty('--screen-ratio', String(presentation.ratio));
}

async function toggleFullscreen(event) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      fullscreenFocus = event?.currentTarget === $('fullscreen') ? $('fullscreen') : document.activeElement;
      if ($('screen').requestFullscreen) await $('screen').requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else { fullscreenFocus = null; toast('请使用播放器自带的全屏按钮'); }
    }
  } catch {
    if (!document.fullscreenElement) fullscreenFocus = null;
    toast('全屏未能打开，请使用播放器自带的全屏按钮');
  }
}

function restoreFullscreenFocus() {
  const target = fullscreenFocus; fullscreenFocus = null;
  if (!target || state.route.view !== 'watch') return;
  const retained = target.isConnected && target.closest('#watch-page') && target.getClientRects().length && !target.disabled;
  (retained ? target : $('screen')).focus({ preventScroll: true });
}

function focusPlayerArea(id) {
  const target = $(id);
  target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  target.focus({ preventScroll: true });
}

function automaticPlaybackAllowed() {
  return navigator.onLine !== false && !document.hidden && !state.userPaused && !state.autoplayBlocked;
}

function renderPlaybackExperience(force = false) {
  if (!force && performance.now() - state.lastExperienceRender < 1000) return;
  state.lastExperienceRender = performance.now();
  const value = playbackExperience.state;
  const seconds = milliseconds => milliseconds < 100 ? '< 0.1 秒' : (milliseconds / 1000).toFixed(1) + ' 秒';
  $('experience-first-label').textContent = value.evidence === 'playing' ? '起播（兼容估计）' : '首幅画面';
  $('experience-first').textContent = value.firstFrameMs === null ? '尚未起播' : seconds(value.firstFrameMs);
  $('experience-buffer').textContent = value.buffers + ' 次 · ' + (value.bufferMs / 1000).toFixed(1) + ' 秒';
  $('experience-watch').textContent = (value.watchMs / 1000).toFixed(0) + ' 秒';
  $('experience-recovery').textContent = value.recoveryMs === null ? '暂无恢复记录' : seconds(value.recoveryMs);
  $('experience-attempts').textContent = value.attempts + ' 次';
}

function captureFirstFrame(version) {
  if (!state.frameCallbackSupported) return;
  try {
    state.frameCallback = video.requestVideoFrameCallback((_time, metadata) => {
      if (version !== state.playbackVersion || state.switching || state.route.view !== 'watch') return;
      state.frameCallback = null;
      const visible = automaticPlaybackAllowed() && !video.paused && !video.seeking && !state.pendingResume && state.resumeSeekTarget === null && metadata.width > 0 && metadata.height > 0;
      if (visible && playbackExperience.frame('frame')) { renderPlaybackExperience(true); return; }
      if (playbackExperience.state.active) captureFirstFrame(version);
    });
  } catch {
    state.frameCallbackSupported = false;
    if (!video.paused && !video.seeking && !state.pendingResume && state.resumeSeekTarget === null && video.readyState >= 3 && automaticPlaybackAllowed()) { playbackExperience.frame('playing'); renderPlaybackExperience(true); }
  }
}

function renderPlaybackState(status) {
  const restoring = state.pendingResume > 0 || state.resumeSeekTarget !== null;
  $('screen').classList.toggle('resuming', restoring && !state.autoplayBlocked);
  const earlySwitch = $('early-switch');
  const canSwitch = status.waitMs >= 4000 && ['loading', 'buffering'].includes(status.phase) && automaticPlaybackAllowed() && $('auto-source').checked && playbackFallback.available(state.current, state.group?.variants);
  if (!canSwitch && document.activeElement === earlySwitch) $('screen').focus({ preventScroll: true });
  earlySwitch.hidden = !canSwitch;
  const offlineMessage = video.readyState < 3 ? '网络可能已断开，观看位置已保留。' : '';
  const blockedFailure = status.phase === 'blocked' && Boolean(status.reason || video.error);
  const phase = blockedFailure ? 'blocked-failed' : restoring && ['loading', 'paused'].includes(status.phase) ? status.phase + '-resuming' : status.phase;
  if (phase === state.playbackPhase) {
    if (status.phase === 'offline' && $('screen-message').textContent !== offlineMessage) screenMessage(offlineMessage);
    return;
  }
  state.playbackPhase = phase;
  $('playback-feedback').hidden = !blockedFailure && !['offline', 'failed', 'seek-timeout'].includes(status.phase);
  const messages = {
    loading: restoring ? '正在恢复观看位置…' : '正在加载视频…', buffering: '正在缓冲，稍等一下…', seeking: '正在跳转到所选位置…',
    'seek-timeout': '跳转暂未完成，可从当前选定位置重试。', paused: restoring ? '已暂停 · 正在恢复观看位置…' : '已暂停',
    offline: '网络可能已断开；已缓冲的画面仍可观看，恢复网络后会尝试继续。',
    recovering: status.reason, failed: status.reason || '当前线路无法播放，可重试或选择其他来源。',
    blocked: blockedFailure ? '这条线路未能加载，可从当前位置重试。' : '请点击播放器开始观看。', playing: '正在观看 · ' + sourceLabel(state.current),
    ended: nextEpisode(state.episode, state.current?.lines?.[state.line]?.episodes?.length || 0) < 0 ? '本集已播完，当前来源暂无下一集。' : '本集已播完，可以继续下一集。',
  };
  if (messages[status.phase]) $('play-status').textContent = messages[status.phase];
  if (restoring && ['loading', 'paused'].includes(status.phase)) screenMessage('正在恢复观看位置…');
  else if (['loading', 'buffering', 'seeking', 'seek-timeout', 'recovering', 'blocked', 'failed'].includes(status.phase)) screenMessage(messages[status.phase]);
  else if (status.phase === 'offline') screenMessage(offlineMessage);
  else if (status.phase !== 'background') screenMessage('');
}

function checkPlayback(playing = false) {
  if (state.route.view !== 'watch' || !playbackMonitor.state.active) return;
  const status = playbackMonitor.check({
    position: video.currentTime, ready: video.readyState, paused: video.paused, ended: video.ended,
    seeking: video.seeking && (state.resumeSeekTarget === null || Math.abs(video.currentTime - state.resumeSeekTarget) > 0.5),
    resumeSeeking: video.seeking && state.resumeSeekTarget !== null && Math.abs(video.currentTime - state.resumeSeekTarget) <= 0.5,
    resumePending: state.pendingResume > 0 || state.resumeSeekTarget !== null,
    userPaused: state.userPaused, hidden: document.hidden,
    offline: navigator.onLine === false, blocked: state.autoplayBlocked, error: Boolean(video.error), playing,
    automatic: $('auto-source').checked && !playbackFallback.state.stopped,
    startupTimeout: playbackExperience.startupTimeout(state.current, state.line, $('auto-source').checked && playbackFallback.available(state.current, state.group?.variants)),
  });
  playbackExperience.observe(status.phase, { position: video.currentTime, rate: video.playbackRate, seeking: video.seeking }); renderPlaybackExperience();
  renderPlaybackState(status);
  if (status.action === 'recover') {
    const position = playbackPosition(); saveProgress(); playbackFallback.remember(position);
    fallbackMessage(status.reason + '，保留观看位置；也可暂停自动换源。');
    startEpisode(state.episode, position, true, true);
  } else if (status.action === 'fail') playbackError(status.reason);
}

function monitorPlayback(position, recovered = false) {
  clearInterval(state.monitorTimer);
  playbackMonitor.begin({ position, recovered, startupTimeout: playbackExperience.startupTimeout(state.current, state.line) });
  const version = state.playbackVersion;
  state.monitorTimer = setInterval(() => { if (version === state.playbackVersion) checkPlayback(); }, 1000);
  checkPlayback();
}

function reportPlaybackFailure(reason = '视频线路发生错误', version = state.playbackVersion) {
  if (version !== state.playbackVersion || state.route.view !== 'watch') return;
  if (!playbackMonitor.state.active) monitorPlayback(playbackPosition(), true);
  playbackMonitor.fail(reason); checkPlayback();
}

function resumePlaybackChecks() {
  if (state.route.view !== 'watch') return;
  playbackExperience.observe(document.hidden ? 'background' : navigator.onLine === false ? 'offline' : state.userPaused ? 'paused' : state.autoplayBlocked ? 'blocked' : 'loading');
  if (state.autoBusy && !automaticPlaybackAllowed()) {
    state.autoController?.abort(); state.autoController = null; state.autoBusy = false;
    destroyPlayback(); playbackExperience.wait(document.hidden ? 'background' : navigator.onLine === false ? 'offline' : state.userPaused ? 'paused' : 'blocked');
    state.autoPending = { epoch: playbackFallback.state.epoch, reason: '来源查询中断，正在等待恢复' };
    monitorPlayback(playbackFallback.state.position, true); playbackMonitor.fail(state.autoPending.reason);
  }
  if (state.autoPending && !automaticPlaybackAllowed() && !playbackMonitor.state.active) {
    monitorPlayback(playbackFallback.state.position, true); playbackMonitor.fail(state.autoPending.reason);
  }
  checkPlayback();
  if (state.autoPending?.epoch === playbackFallback.state.epoch && !state.discovering && automaticPlaybackAllowed()) {
    const reason = state.autoPending.reason; state.autoPending = null; reportPlaybackFailure(reason);
  }
}

async function retryCurrentPlayback() {
  if (state.manualRetryBusy || state.route.view !== 'watch') return;
  if (!state.current?.lines?.[state.line]?.episodes[state.episode]) { prepareVideo(state.route); return; }
  const current = state.current; const line = state.line; const index = state.episode; const version = state.playbackVersion;
  const episode = current.lines[line].episodes[index];
  const active = () => state.route.view === 'watch' && state.current === current && state.line === line && state.episode === index && state.playbackVersion === version;
  const unavailable = () => {
    if (!active()) return;
    const message = backendTransport.state.phase === 'limited' ? '查询服务今日额度已用完，观看位置已保留，请稍后再试或选择其他来源。' : '查询服务尚未恢复，观看位置已保留，可以再次重试。';
    screenMessage(message); $('play-status').textContent = message; $('playback-feedback').hidden = false;
  };
  const position = playbackPosition(); saveProgress();
  state.manualRetryBusy = true; $('retry-play').disabled = $('reload-play').disabled = true;
  try {
    if (episode.ref) {
      if (backendTransport.state.phase === 'limited') { unavailable(); return; }
      if (backendTransport.state.phase === 'unavailable') {
        screenMessage('正在检查查询服务，观看位置已保留…');
        if (!await backendTransport.retry()) { unavailable(); return; }
      }
      if (backendTransport.state.phase === 'limited') { unavailable(); return; }
    }
    if (active()) await startEpisode(index, position);
  } catch { unavailable(); }
  finally { state.manualRetryBusy = false; $('retry-play').disabled = $('reload-play').disabled = false; }
}

async function playbackError(reason = '线路播放失败', version = state.playbackVersion, manual = false) {
  if (version !== state.playbackVersion || state.route.view !== 'watch' || state.autoBusy) return;
  if (!manual) playbackExperience.fail(); renderPlaybackExperience(true);
  $('playback-feedback').hidden = false;
  screenMessage('这条线路暂时无法播放。');
  $('play-status').textContent = '试试其他来源，切换时会尽量保留这一集和观看位置。';
  if (!$('auto-source').checked || playbackFallback.state.stopped || state.userPaused || !state.current) return;
  saveProgress(); playbackFallback.remember(playbackPosition());
  const epoch = playbackFallback.state.epoch;
  state.autoBusy = true; state.autoPending = null; state.autoLoading = false; destroyPlayback();
  playbackExperience.wait();
  const currentVersion = state.playbackVersion;
  const active = () => epoch === playbackFallback.state.epoch && currentVersion === state.playbackVersion && state.route.view === 'watch' && $('auto-source').checked;
  while (active()) {
    const candidate = playbackFallback.next(state.current, state.group?.variants);
    if (!candidate) {
      state.autoBusy = false;
      if (state.discovering && playbackFallback.state.attempts < playbackFallback.state.maximum) {
        state.autoPending = { epoch, reason }; screenMessage('正在寻找可用的其他来源…');
        fallbackMessage('当前线路失败，正在等待同名同年份来源查询；可以暂停自动换源。');
      } else {
        const exhausted = playbackFallback.state.attempts >= playbackFallback.state.maximum;
        screenMessage(exhausted ? '本集暂时无法播放。' : '暂未找到可用的对应集数。');
        $('play-status').textContent = exhausted ? '自动尝试已结束，观看位置已保留。' : '没有找到可播放的对应集数，可重试或返回影片列表。';
        fallbackMessage(exhausted ? '本集已自动尝试 3 次，自动换源已停止；可手动选择或重新加载。' : '未找到其他可用的对应集数；可手动选择来源或重新加载。');
        playbackExperience.observe('failed'); playbackExperience.finish(); renderPlaybackExperience(true);
      }
      return;
    }
    const counter = playbackFallback.state.attempts + ' / ' + playbackFallback.state.maximum;
    const label = sourceLabel(candidate.item) + (candidate.type === 'line' ? ' · ' + candidate.item.lines[candidate.line].name : '');
    screenMessage('正在尝试 ' + label + '…'); fallbackMessage(reason + ' · 正在自动换源 ' + counter + '：' + label);
    let item = candidate.item; let target = candidate;
    if (candidate.type === 'source') {
      const controller = new AbortController(); state.autoController = controller;
      try {
        const result = await request(item.source, { id: item.id, signal: controller.signal });
        if (!active()) return;
        item = result.videos.find(value => value.uid === item.uid && videoKey(value) === playbackFallback.state.key);
        if (!item) continue;
        target = playbackFallback.lineFor(item);
        if (!target) continue;
      } catch { if (!active()) return; continue; }
      finally { if (state.autoController === controller) state.autoController = null; }
    }
    if (!active()) return;
    state.autoController = null; state.autoBusy = false;
    state.current = item; state.line = target.line;
    state.group.variants = state.group.variants.map(value => value.uid === item.uid ? item : value);
    playbackFallback.mark(item, target.line, target.episode);
    updateTrackedFavorite(item);
    if (state.favoritesDirty) { save('video-favorites', state.favorites); state.favoritesDirty = false; }
    renderDetail(); renderWatch();
    fallbackMessage('已自动选择 ' + sourceLabel(item) + ' · ' + item.lines[target.line].name + '（' + counter + '），正在确认起播。');
    startEpisode(target.episode, playbackFallback.state.position, true);
    return;
  }
}

async function startEpisode(index, resume = 0, automatic = false, recovered = false, paused = false) {
  const episode = state.current?.lines?.[state.line]?.episodes[index]; if (!episode) return;
  const continued = automatic || state.initialPlayback; state.initialPlayback = false;
  state.resumeOverride = null;
  if (!automatic) { cancelFallback(); playbackFallback.begin(state.current, state.line, index, resume); }
  state.autoplayBlocked = false; state.userPaused = paused; state.autoLoading = automatic; state.autoResume = automatic;
  state.localRecovery = recovered;
  state.requestedPlay = false;
  fallbackMessage($('fallback-status').textContent);
  destroyPlayback(); state.episode = index; state.range = Math.floor(index / 30);
  playbackIntent.remember(state.current, index, paused, episode.name);
  playbackExperience.begin(state.current, state.line, continued); renderPlaybackExperience(true);
  state.pendingResume = Math.max(0, Number(resume) || 0); state.lastSave = 0;
  $('playback-feedback').hidden = true;
  renderEpisodes(); screenMessage('正在加载这一集…'); $('play-status').textContent = '正在连接视频来源…';
  window.history.replaceState(null, '', filmRoute('watch', state.current, index, episode.name));
  state.route = { ...state.route, source: state.current.source, id: state.current.id, episode: index, episodeName: episode.name };
  const version = state.playbackVersion;
  monitorPlayback(state.pendingResume, recovered);
  let url = episode.url;
  if (episode.ref) {
    state.resolveController = new AbortController();
    screenMessage('正在解析这一集的播放地址…');
    try {
      url = await requestEpisode(state.current.source, state.current.id, episode.ref, episode.name, { base: config.apiBase || '', signal: state.resolveController.signal, fetchImpl: backendTransport.fetch });
    } catch {
      reportPlaybackFailure('播放地址暂时无法读取', version);
      return;
    }
    if (version !== state.playbackVersion) return;
  }
  state.switching = false;
  state.frameCallbackSupported = typeof video.requestVideoFrameCallback === 'function';
  captureFirstFrame(version);
  const tryPlay = () => { if (state.userPaused) return; state.requestedPlay = true; return video.play().catch(error => {
    if (version !== state.playbackVersion || error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') {
      state.autoplayBlocked = true; state.autoLoading = false; screenMessage('请点击播放器开始观看。');
      fallbackMessage($('fallback-status').textContent);
      $('play-status').textContent = '浏览器限制自动播放，请点击播放器；不会因此自动换源。';
      checkPlayback();
    } else if (error.name === 'NotSupportedError') reportPlaybackFailure('视频格式或线路不可用', version);
    else $('play-status').textContent = '请点击播放器开始观看。';
  }); };
  // HLS.js exposes real rendition choices; native HLS remains the fallback.
  const preferHls = window.Hls?.isSupported();
  if (/\.mp4(?:$|\?)/i.test(url) || (!preferHls && video.canPlayType('application/vnd.apple.mpegurl'))) {
    qualityReady = true; qualityNative = !/\.mp4(?:$|\?)/i.test(url); renderQuality();
    video.src = url; tryPlay();
  } else if (window.Hls?.isSupported()) {
    const hls = new window.Hls({ maxBufferLength: 30, backBufferLength: 30 }); state.hls = hls;
    hls.loadSource(url); hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => { if (version === state.playbackVersion) { qualityReady = true; renderQuality(); tryPlay(); } });
    for (const event of [window.Hls.Events.LEVEL_SWITCHED, window.Hls.Events.LEVELS_UPDATED]) hls.on(event, () => { if (version === state.playbackVersion) renderQuality(); });
    let recovery = 0;
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (version === state.playbackVersion) renderQuality();
      if (!data.fatal || version !== state.playbackVersion) return;
      if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && recovery++ < 1) { hls.recoverMediaError(); return; }
      reportPlaybackFailure('视频线路发生错误', version);
    });
  } else { reportPlaybackFailure('当前浏览器不支持这个视频格式', version); }
}

function renderVariantDiscovery() {
  const { group, loading, completed, total, failed } = variantDiscovery.state;
  if (!group || state.group !== group || !state.current) return;
  state.discovering = loading;
  const currentOrigin = group.variants.findIndex(item => item.origin === state.current.origin);
  if (currentOrigin >= 0 && !group.variants.some(item => item.uid === state.current.uid)) group.variants[currentOrigin] = state.current;
  $('variant-status').textContent = loading ? '已找到 ' + group.variants.length + ' 个来源 · 继续查询 ' + completed + ' / ' + total + '，已显示的来源可以先用。' : failed.length ? '部分来源查询失败，已保留可用的目录结果。' : '共找到 ' + group.variants.length + ' 个来源；实际可播状态以起播为准。';
  renderVariants();
  if (state.autoPending?.epoch === playbackFallback.state.epoch && automaticPlaybackAllowed() && (playbackFallback.available(state.current, group.variants) || !loading)) {
    const reason = state.autoPending.reason; state.autoPending = null; reportPlaybackFailure(reason);
  }
}

function allKnownVideos() {
  return [...state.home.picks, ...state.home.tv, ...state.home.movie, ...state.home.short, ...state.catalog.items, ...state.favorites, ...state.history];
}

async function prepareVideo(route) {
  cancelFallback(); variantDiscovery.stop(); state.discovering = false;
  const version = ++state.detailVersion; destroyPlayback(); state.current = null; state.group = null; state.detailLoading = true;
  state.initialPlayback = route.view === 'watch';
  if (state.initialPlayback) { playbackExperience.open(document.hidden ? 'background' : navigator.onLine === false ? 'offline' : 'loading'); renderPlaybackExperience(true); }
  $('playback-feedback').hidden = true;
  $('detail-back').href = state.lastList;
  $('watch-list-back').href = $('failed-watch-back').href = state.lastList;
  $('watch-back').href = filmRoute('detail', route);
  state.episode = -1; state.line = 0; state.range = 0;
  $('detail-episodes').replaceChildren(); $('episodes').replaceChildren(); $('variant-buttons').replaceChildren(); $('detail-variants').replaceChildren();
  $('line-label').hidden = true; $('episode-ranges').replaceChildren();
  $('detail-play').disabled = true; $('next-episode').disabled = true; $('previous-episode').disabled = true; updateFavoriteButtons();
  const known = allKnownVideos().find(item => item.uid === route.source + ':' + route.id);
  $('detail-title').textContent = known?.title || '正在获取影片…'; $('playing-title').textContent = known?.title || '正在获取影片…';
  for (const id of ['detail-meta', 'detail-remarks', 'detail-schedule', 'detail-updated-at', 'detail-schedule-note', 'detail-progress', 'detail-actors', 'detail-director', 'detail-description', 'variant-status', 'episode-caption', 'episode-status', 'video-description']) $(id).textContent = '';
  $('detail-updates').hidden = true; $('detail-schedule-note').hidden = true;
  $('detail-poster').replaceChildren(); $('detail-status').textContent = '正在获取影片信息…';
  $('play-status').textContent = '正在获取剧集…'; screenMessage('正在获取剧集…');
  try {
    const result = await request(route.source, { id: route.id });
    if (version !== state.detailVersion) return;
    const current = result.videos.find(item => item.id === route.id);
    if (!current) throw new Error('这部影片已从来源中移除');
    state.current = current; state.detailLoading = false;
    updateTrackedFavorite(current);
    if (state.favoritesDirty && !state.watchlist.loading) { save('video-favorites', state.favorites); state.favoritesDirty = false; }
    const variants = groupVideos([current, ...allKnownVideos().filter(item => videoKey(item) === videoKey(current))])[0].variants;
    state.group = { ...current, variants };
    renderDetail(); variantDiscovery.open(state.group);
    if (route.view === 'watch') {
      renderWatch();
      const lines = current.lines;
      const override = state.resumeOverride?.uid === current.uid ? state.resumeOverride : null;
      state.resumeOverride = null;
      const saved = progressFor(current);
      const selection = resolvePlaybackSelection(current, { episode: route.episode, episodeName: route.episodeName || (state.restorePlaybackIntent ? playbackIntent.episodeName(current, route.episode) : ''), saved, override, automatic: $('auto-source').checked, priority: playbackExperience.priority });
      if (!lines.length) {
        const name = selection.name; const position = selection.position;
        renderEpisodes(); playbackFallback.begin(current, 0, route.episode || 0, position, name);
        reportPlaybackFailure('来源没有可播放的剧集'); return;
      }
      if (selection.missing) {
        const requested = selection.name;
        const missing = override || { uid: current.uid, episode: requested, index: route.episode ?? 0, position: selection.position, paused: state.restorePlaybackIntent && playbackIntent.paused(current, route.episode, requested) };
        state.resumeOverride = missing; state.pendingResume = missing.position || 0; state.userPaused = Boolean(missing.paused);
        playbackIntent.remember(current, missing.index, state.userPaused, requested);
        renderEpisodes(); $('episode-caption').textContent = '原观看集数：' + requested;
        $('playback-feedback').hidden = false;
        screenMessage('这个来源暂无 ' + requested + '，请手动选集或切换来源。');
        $('play-status').textContent = '已保留原来集数与位置，尚未开始播放。';
        playbackExperience.observe('paused'); renderPlaybackExperience(true); return;
      }
      state.line = selection.line;
      const index = selection.episode; const position = selection.position;
      renderWatch();
      const paused = Boolean(override?.paused || (state.restorePlaybackIntent && playbackIntent.paused(current, index, selection.name)));
      startEpisode(index, position || 0, false, false, paused);
      if (state.line !== 0) fallbackMessage('已按近期观看表现选择 ' + lines[state.line].name + '；仍可手动选择其他线路。');
    }
  } catch (error) {
    if (version !== state.detailVersion) return;
    state.detailLoading = false; $('detail-status').textContent = error.message;
    playbackExperience.observe('failed'); playbackExperience.finish(); renderPlaybackExperience(true);
    $('playback-feedback').hidden = false;
    $('play-status').textContent = error.message; screenMessage('暂时未能取得剧集，可以重试或返回列表。');
  }
}

function switchVariant(variant) {
  let index;
  if (state.route.view === 'watch') {
    const episode = currentEpisode();
    index = state.episode >= 0 ? state.episode : state.resumeOverride?.index ?? 0;
    state.resumeOverride = { uid: variant.uid, episode: episode?.name || state.resumeOverride?.episode, index, position: playbackPosition(), paused: state.userPaused };
    saveProgress();
  }
  navigate(filmRoute(state.route.view === 'watch' ? 'watch' : 'detail', variant, index, state.resumeOverride?.episode));
}

function saveProgress() {
  const episode = currentEpisode();
  if (state.switching || state.pendingResume > 0 || state.resumeSeekTarget !== null || !state.current || !episode || !Number.isFinite(video.duration) || video.currentTime <= 0) return;
  const sample = state.current.uid + '|' + episode.name + '|' + video.currentTime + '|' + video.duration;
  if (sample === lastProgressSample) return;
  lastProgressSample = sample;
  syncSavedRecords();
  playbackExperience.checkpoint();
  const summary = playbackSummary(state.current, state.line);
  state.history = rememberProgress(state.history, { ...state.current, playbackLabel: summary.kind === 'episodes' ? '' : summary.label }, episode.name, video.currentTime, video.duration);
  let acknowledged = false;
  state.favorites = state.favorites.map(saved => {
    if (videoKey(saved) !== videoKey(state.current)) return saved;
    const next = acknowledgeFavorite(saved, state.history); acknowledged ||= next !== saved; return next;
  });
  if (acknowledged) save('video-favorites', state.favorites);
  save('video-history', state.history); updateCounts();
}

function playNext() {
  if (state.episode < 0) { toast('请先选择要观看的集数'); return; }
  const episodes = state.current?.lines?.[state.line]?.episodes || [];
  const next = nextEpisode(state.episode, episodes.length);
  if (next >= 0) { saveProgress(); startEpisode(next); }
}

function handleRoute() {
  syncSavedRecords();
  const route = parseRoute(location.hash);
  const searchSubmitted = route.view === 'search' && submittedSearchHash === location.hash;
  submittedSearchHash = '';
  state.restorePlaybackIntent = !state.route.view && route.view === 'watch';
  if (!state.restorePlaybackIntent) playbackIntent.clear();
  const fromCatalog = ['browse', 'search'].includes(state.route.view);
  if (fromCatalog) rememberCatalogPosition();
  if (state.route.view === 'home') {
    rememberHomePosition();
    if (route.view !== 'home') homeLoader.stop();
  }
  const restore = searchSubmitted && route.query !== state.route.query ? null : listNavigation.catalog(location.hash);
  const homeRestore = route.view === 'home' && state.route.view !== 'home' ? listNavigation.home() : null;
  cancelFallback();
  variantDiscovery.stop(); state.discovering = false;
  clearTimeout(filterTimer);
  if (route.view !== 'library' && state.watchlist.loading) watchlistRefresher.stop();
  if (!['browse', 'search'].includes(route.view) && state.catalog.loading) catalogLoader.stop();
  const changedFilm = route.source !== state.route.source || route.id !== state.route.id;
  if (state.route.view === 'watch' && (route.view !== 'watch' || changedFilm)) { saveProgress(); destroyPlayback(); }
  state.detailVersion++; // Invalidate details and discovery when leaving their page.
  state.route = route;
  $('opening-page').hidden = true;
  for (const id of ['home', 'catalog', 'library', 'detail', 'watch']) {
    $(id + '-page').hidden = id === 'catalog' ? !['browse', 'search'].includes(route.view) : route.view !== id;
  }
  if (document.activeElement?.closest('[hidden]')) document.activeElement.blur();
  const active = route.view === 'browse' ? route.category : route.view === 'search' ? '' : route.view === 'detail' || route.view === 'watch' ? '' : route.view;
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.body.classList.toggle('watching', route.view === 'watch');
  document.body.classList.toggle('browsing', ['browse', 'search'].includes(route.view));
  if (['home', 'browse', 'search', 'library'].includes(route.view)) state.lastList = listNavigation.remember(location.hash || '#home');
  document.title = '私人放映室 · 打个大柚子的兔子洞';
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (route.view === 'home') {
    if (homeRestore?.hero) state.hero = homeRestore.hero;
    const version = state.detailVersion;
    renderHome(); const pending = homeLoader.open(); const focused = document.activeElement;
    Promise.resolve(pending).then(() => {
      if (!homeRestore || version !== state.detailVersion || window.scrollY !== 0 || document.activeElement !== focused) return;
      const grid = homeRestore.anchor ? $(homeRestore.anchor.section + '-cards') : $('picks-cards');
      restoreListPosition(homeRestore, grid);
    });
  }
  else if (route.view === 'library') renderLibrary();
  else if (['browse', 'search'].includes(route.view)) {
    if (route.view === 'search') $('query').value = route.query;
    renderCatalog();
    const version = state.detailVersion;
    const pending = loadCatalog({ restore, retrySources: searchSubmitted }); const filters = state.catalog.filters; const key = state.catalog.key; const focused = document.activeElement;
    Promise.resolve(pending).then(() => {
      if (!restore || version !== state.detailVersion || filters !== state.catalog.filters || key !== state.catalog.key || window.scrollY !== 0 || document.activeElement !== focused) return;
      restoreListPosition(restore, $('cards'));
    });
  }
  else prepareVideo(route);
}

function applyPendingResume() {
  if (state.switching) return;
  if (state.pendingResume > 0 && Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 1) {
    const target = resumePosition(state.pendingResume, video.duration, state.autoResume);
    state.resumeSeekTarget = target; state.pendingResume = 0;
    if (Math.abs(video.currentTime - target) > 0.5 || video.seeking) video.currentTime = target;
    else state.resumeSeekTarget = null;
  }
}
video.addEventListener('loadedmetadata', () => {
  if (state.switching) return;
  adaptScreen(); applyPendingResume();
  video.playbackRate = Number($('speed').value);
  renderQuality();
});
video.addEventListener('durationchange', () => { if (!state.switching) { applyPendingResume(); checkPlayback(); } });
video.addEventListener('resize', () => { adaptScreen(); renderQuality(); });
video.addEventListener('emptied', adaptScreen);
video.addEventListener('canplay', () => { if (!state.switching) { applyPendingResume(); checkPlayback(); } });
video.addEventListener('play', () => {
  if (state.switching) return;
  state.requestedPlay = true; state.userPaused = false; state.autoplayBlocked = false;
  playbackIntent.remember(state.current, state.episode, false, currentEpisode()?.name);
  renderQuality();
  if (playbackMonitor.state.phase === 'ended') monitorPlayback(video.currentTime, playbackMonitor.state.recovered);
  else checkPlayback();
});
for (const event of ['waiting', 'stalled', 'seeking']) video.addEventListener(event, () => { if (!state.switching) checkPlayback(); });
video.addEventListener('seeked', () => { if (!state.switching) { state.resumeSeekTarget = null; checkPlayback(); } });
video.addEventListener('playing', () => {
  if (!state.switching && state.current) {
    state.autoplayBlocked = false; state.userPaused = false; state.autoLoading = false;
    if (playbackMonitor.state.phase === 'failed') monitorPlayback(video.currentTime, true);
    checkPlayback(true);
    if (!state.frameCallbackSupported && !video.seeking && !state.pendingResume && state.resumeSeekTarget === null && video.videoWidth > 0 && video.videoHeight > 0 && playbackExperience.frame('playing')) renderPlaybackExperience(true);
    state.health.set(state.current.source, '本次起播成功 · ' + state.current.title + ' ' + currentEpisode()?.name); renderSources();
    if (playbackFallback.state.attempts && !playbackFallback.state.stopped) fallbackMessage('自动换源后已起播 · ' + sourceLabel(state.current) + ' · ' + state.current.lines[state.line].name + ' · 本集已自动尝试 ' + playbackFallback.state.attempts + ' / 3 次。');
    else if (state.localRecovery) fallbackMessage('当前线路已恢复播放，继续上次卡住的位置。');
  }
});
video.addEventListener('error', () => { if (!state.switching) reportPlaybackFailure(); });
video.addEventListener('timeupdate', () => {
  if (!state.switching && !state.pendingResume && state.resumeSeekTarget === null && video.readyState >= 2) playbackFallback.remember(video.currentTime);
  if (!state.switching) checkPlayback();
  if (video.currentTime > 0 && Date.now() - state.lastSave > 5000) { state.lastSave = Date.now(); saveProgress(); }
});
video.addEventListener('pause', () => {
  if (!state.switching && state.requestedPlay && video.paused && !video.error && !video.ended && !document.hidden) {
    state.userPaused = true; playbackIntent.remember(state.current, state.episode, true, currentEpisode()?.name); checkPlayback();
  }
  saveProgress();
  renderQuality();
});
video.addEventListener('ended', () => { saveProgress(); checkPlayback(); if ($('auto-next').checked) playNext(); });
window.addEventListener('online', resumePlaybackChecks);
window.addEventListener('offline', resumePlaybackChecks);
document.addEventListener('visibilitychange', resumePlaybackChecks);
document.addEventListener('visibilitychange', () => { if (!document.hidden && syncSavedRecords()) renderSavedRecords(); });
window.addEventListener('storage', event => {
  if (event.storageArea === storage && (event.key === 'video-account-session-v1' || event.key === null) && accountClient.refreshSession()) accountClient.sync();
  if (event.storageArea === storage && event.key === favoriteStorageKey(state.account) && syncSavedRecords()) renderSavedRecords();
  if (event.storageArea === storage && (event.key === null || Object.hasOwn(savedBaselines, event.key)) && syncSavedRecords()) renderSavedRecords();
});
window.addEventListener('online', () => { if (backendTransport.state.phase !== 'limited') backendTransport.retry().then(ready => { if (ready) accountClient.sync(); }); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { const changed = accountClient.refreshSession(); if (accountClient.state.user && (changed || Date.now() - accountClient.state.lastSync > 60000)) accountClient.sync(); } });
window.addEventListener('pagehide', () => {
  if (['browse', 'search'].includes(state.route.view)) rememberCatalogPosition();
  if (state.route.view === 'home') rememberHomePosition();
  saveProgress(); playbackExperience.checkpoint();
});
window.addEventListener('hashchange', handleRoute);

$('search-form').addEventListener('submit', event => {
  event.preventDefault(); const query = $('query').value.trim();
  if (query) { submittedSearchHash = '#search?q=' + encodeURIComponent(query); navigate(submittedSearchHash); } else $('query').focus();
});
$('hero-play').addEventListener('click', () => {
  const item = heroVideo(); if (item) navigate(filmRoute('watch', progressFor(item) || item));
});
$('hero-detail').addEventListener('click', () => {
  const item = heroVideo(); if (item) navigate(filmRoute('detail', item));
});
$('detail-play').addEventListener('click', () => {
  if (state.current) navigate(filmRoute('watch', state.current));
});
$('detail-favorite').addEventListener('click', () => toggleFavorite(state.current));
$('favorite-current').addEventListener('click', () => toggleFavorite(state.current));
$('load-more').addEventListener('click', () => loadCatalog({ more: true }));
$('reload-catalog').addEventListener('click', () => loadCatalog({ force: true }));
$('pause-catalog').addEventListener('click', () => { clearTimeout(filterTimer); catalogLoader.stop(); });
$('reset-filters').addEventListener('click', () => { resetFilters(); $('filter-toggle').focus({ preventScroll: true }); });
document.querySelectorAll('.filter-options, #episode-ranges, #episodes, #hero-picks').forEach(group => group.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const options = [...group.children].filter(option => option.getClientRects().length && !option.disabled); const index = options.indexOf(event.target); if (index < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
  options.forEach((option, value) => { option.tabIndex = value === next ? 0 : -1; }); options[next].focus();
}));
for (const section of ['picks', 'short', 'tv', 'movie']) $(section + '-retry').addEventListener('click', () => homeLoader.retry(section));
$('refresh-favorites').addEventListener('click', () => watchlistRefresher.refresh(state.favorites));
$('stop-favorites').addEventListener('click', () => watchlistRefresher.stop());
$('stop-auto-source').addEventListener('click', () => { cancelFallback('本集自动换源已暂停，可手动选择线路或重新加载。'); $('playback-feedback').hidden = false; screenMessage('自动换源已暂停。'); });
$('auto-source').addEventListener('change', () => {
  if (!$('auto-source').checked) cancelFallback('自动换源已关闭，可手动选择线路。');
  else fallbackMessage('自动选线与换源已开启；下次进入观看会优先选择近期较顺畅的线路。');
  try { storage?.setItem('video-auto-source', $('auto-source').checked ? 'on' : 'off'); } catch { toast('浏览器无法保存开关，下次打开将恢复默认值。'); }
});
for (const filter of ['all', 'new']) $('favorites-' + filter).addEventListener('click', () => { state.favoriteFilter = filter; renderLibrary(); $('favorites-' + filter).focus(); });
$('speed').addEventListener('change', () => { video.playbackRate = Number($('speed').value); });
$('quality-select').addEventListener('change', () => {
  const hls = state.hls; const selected = Number($('quality-select').value);
  const summary = playbackQuality(hls?.levels, { selected, ready: qualityReady });
  if (!hls || !summary.selectable || summary.selected !== selected) { renderQuality(); return; }
  const previous = qualitySelection; qualitySelection = selected;
  try { hls.nextLevel = selected; }
  catch { qualitySelection = previous; toast('清晰度暂时无法切换，已保留播放状态。'); }
  renderQuality();
});
$('quality-source').addEventListener('click', () => focusPlayerArea('episode-heading'));
$('screen-mode').addEventListener('change', adaptScreen);
$('fullscreen').addEventListener('click', toggleFullscreen);
$('exit-fullscreen').addEventListener('click', toggleFullscreen);
$('open-episodes').addEventListener('click', () => focusPlayerArea('episode-heading'));
$('return-screen').addEventListener('click', () => focusPlayerArea('screen'));
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  if (document.fullscreenElement === $('screen')) $('screen').focus({ preventScroll: true });
  else if (!document.fullscreenElement) restoreFullscreenFocus();
});
video.addEventListener('webkitendfullscreen', restoreFullscreenFocus);
$('line-select').addEventListener('change', () => {
  const name = currentEpisode()?.name || state.resumeOverride?.episode;
  const line = Number($('line-select').value);
  const index = matchingEpisode(state.current.lines[line].episodes, name, /电影|片$/.test(state.current.category || ''));
  if (index < 0) {
    $('line-select').value = String(state.line);
    toast('这条线路暂无 ' + name + '，已保留原线路与位置。'); return;
  }
  const position = playbackPosition(); const paused = state.userPaused;
  saveProgress(); state.line = line;
  startEpisode(index, position, false, false, paused);
});
$('reverse-episodes').addEventListener('click', () => { state.reverse = !state.reverse; renderEpisodes(); });
$('next-episode').addEventListener('click', playNext);
$('previous-episode').addEventListener('click', () => { if (state.episode > 0) { saveProgress(); startEpisode(state.episode - 1); } });
$('skip-forward').addEventListener('click', () => { if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 90); });
$('retry-play').addEventListener('click', retryCurrentPlayback);
$('early-switch').addEventListener('click', () => { if (automaticPlaybackAllowed()) playbackError('已请求切换备用线路', state.playbackVersion, true); });
$('reload-play').addEventListener('click', retryCurrentPlayback);
$('clear-experience').addEventListener('click', () => { playbackExperience.clear(); if (state.current) renderWatch(); toast('近期选线记录已清除，当前播放继续。'); });
$('clear-source-health').addEventListener('click', () => { sourceHealth.clear(); renderSources(); toast('查询记录已清除，下次查询按默认顺序尝试。'); });
$('change-source').addEventListener('click', () => {
  const variants = state.group?.variants || []; const index = variants.findIndex(item => item.uid === state.current?.uid);
  if (variants.length > 1) switchVariant(variants[(index + 1) % variants.length]);
});
document.addEventListener('keydown', event => {
  if (state.route.view !== 'watch' || state.detailLoading || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.isContentEditable || event.altKey || event.metaKey || event.ctrlKey) return;
  if (['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code) && /BUTTON|A|SUMMARY|VIDEO/.test(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); if (video.paused) video.play().catch(() => toast('请点击播放器开始观看')); else video.pause(); }
  else if (['ArrowLeft', 'ArrowRight'].includes(event.code) && Number.isFinite(video.duration)) { event.preventDefault(); video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + (event.code === 'ArrowRight' ? 10 : -10))); }
  else if (event.code === 'KeyN') playNext();
  else if (event.code === 'KeyF') toggleFullscreen();
});
document.querySelectorAll('[data-blog-link]').forEach(link => {
  link.href = String(config.blogHome || '').replace(/\/$/, '') + link.dataset.blogLink;
});
const sourcePicks = document.querySelector('.source-picks');
try { $('auto-source').checked = storage?.getItem('video-auto-source') !== 'off'; } catch { $('auto-source').checked = true; }
const reloadCatalog = $('reload-catalog');
$('account-login').addEventListener('click', async () => {
  if (loggingIn || accountClient.state.enabled === false) return;
  loggingIn = true; renderAccount();
  try { location.assign(await accountClient.login(location.origin + location.pathname, location.hash || '#home')); }
  catch (error) { loggingIn = false; renderAccount(); $('account-status').textContent = error.message; $('account-status').classList.add('error'); }
});
$('account-sync').addEventListener('click', () => accountClient.sync());
$('account-import').addEventListener('click', () => { try { accountClient.importLocal(); toast('本机收藏已加入当前账号片单，原收藏仍保留。'); } catch (error) { toast(error.message); } });
$('account-logout').addEventListener('click', () => { accountClient.logout(); toast('已退出登录，回到本机未登录片单。'); });
$('service-retry').addEventListener('click', async () => {
  $('service-retry').disabled = true;
  try { if (await backendTransport.retry()) { accountClient.sync(); toast('查询服务已恢复，可以继续搜索或刷新栏目。'); } else toast('查询服务尚未恢复，缓存目录和本地收藏仍保留。'); }
  finally { $('service-retry').disabled = false; }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('account-panel').open) { $('account-panel').open = false; $('account-summary').focus(); } });
document.addEventListener('click', event => { if ($('account-panel').open && !$('account-panel').contains(event.target)) $('account-panel').open = false; });
sourcePicks.replaceChildren(...SOURCES.map(source => {
  const label = el('label'); const input = document.createElement('input');
  input.type = 'checkbox'; input.value = source.id; input.checked = true;
  label.append(input, el('span', '', source.name)); return label;
}), reloadCatalog);
accountClient.initialize(location.hash); renderAccount(); renderServiceStatus(backendTransport.state);
updateCounts(); renderSources(); handleRoute();
