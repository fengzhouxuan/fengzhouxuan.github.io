export const SOURCES = [
  { id: 'liangzi', name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod' },
  { id: 'ruyi', name: '如意资源', api: 'https://cj.rycjapi.com/api.php/provide/vod', browseTypeMap: { 52: null } },
  { id: 'feifan', name: '非凡资源', api: 'https://api.ffzyapi.com/api.php/provide/vod', browseTypeMap: { 46: 36, 52: null } },
  { id: 'pianku', name: '片库', site: 'https://4k01.pianku.online', browseTypes: [6, 7, 8, 9, 10, 11, 12, 20, 13, 16] },
  { id: 'auete', name: 'Auete', site: 'https://www.aeete.com', search: false, browseTypes: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31] },
  { id: 'zip0', name: 'ZIP0', site: 'https://zip0.com', browseTypes: [] },
];

export function validVideoId(source, id) {
  if (!SOURCES.some(item => item.id === source)) return false;
  if (source === 'auete') return /^(?:Movie|Tv|Dm|Zy)\/[A-Za-z0-9_-]{1,30}\/[A-Za-z0-9_-]{1,180}$/.test(String(id));
  if (source === 'zip0') return /^[a-z0-9_-]{1,30}:\d{1,12}$/.test(String(id));
  return /^\d{1,12}$/.test(String(id));
}

export function supportsSource(source, route) {
  if (route.view === 'search') return source.search !== false;
  return source.browseTypeMap?.[route.type] !== null && (!source.browseTypes || source.browseTypes.includes(route.type));
}

export function sourceLabel(item) {
  const name = SOURCES.find(source => source.id === item.source)?.name || item.source;
  return item.source === 'zip0' ? name + ' · ' + item.id.split(':')[0] : name;
}

// These feeds filter exact type IDs; parent IDs do not include child categories.
export const CATEGORIES = [
  { id: 'tv', name: '电视剧', types: [[13, '国产剧'], [16, '欧美剧'], [15, '韩国剧'], [22, '日本剧'], [24, '泰国剧'], [14, '香港剧'], [21, '台湾剧'], [23, '海外剧']] },
  { id: 'movie', name: '电影', types: [[11, '剧情'], [6, '动作'], [7, '喜剧'], [8, '爱情'], [9, '科幻'], [10, '恐怖'], [12, '战争'], [20, '纪录片']] },
  { id: 'anime', name: '动漫', types: [[29, '国产动漫'], [30, '日韩动漫'], [31, '欧美动漫'], [32, '港台动漫'], [33, '海外动漫']] },
  { id: 'variety', name: '综艺', types: [[25, '大陆综艺'], [26, '港台综艺'], [27, '日韩综艺'], [28, '欧美综艺']] },
  { id: 'short', name: '短剧', types: [[46, '短剧'], [52, 'AI漫剧']] },
];
const FILTER_AREAS = { mainland: /大陆|内地|中国$/, hk: /香港|台湾|港台/, japan: /日本/, korea: /韩国/, west: /美国|英国|加拿大|法国|德国|欧美/ };

export function videoKey(video) {
  return `${String(video.title || '').replace(/\s+/g, '').toLowerCase()}|${video.year || ''}`;
}

export function parseRoute(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  if (path === 'detail' || path === 'watch') {
    const source = params.get('source'); const id = params.get('id');
    if (!validVideoId(source, id || '')) return { view: 'home' };
    const episode = Number(params.get('episode'));
    return { view: path, source, id, episode: Number.isInteger(episode) && episode > 0 && episode <= 10000 ? episode - 1 : null };
  }
  if (path === 'browse' || path === 'search') {
    const category = CATEGORIES.find(item => item.id === params.get('category')) || CATEGORIES[0];
    const type = Number(params.get('type'));
    return { view: path, category: category.id, type: category.types.some(item => item[0] === type) ? type : category.types[0][0], query: (params.get('q') || '').trim().slice(0, 80) };
  }
  if (path === 'library') return { view: path, tab: params.get('tab') === 'history' ? 'history' : 'favorites' };
  return { view: 'home' };
}

export function createListNavigation(storage = null) {
  const key = 'video-last-list';
  const catalogKey = 'video-catalog-context';
  const homeKey = 'video-home-context';
  const normalize = hash => {
    if (typeof hash !== 'string' || hash.length > 1024 || !hash.startsWith('#')) return '#home';
    const route = parseRoute(hash);
    if (route.view === 'browse') return '#browse?' + new URLSearchParams({ category: route.category, type: route.type });
    if (route.view === 'search') return '#search?' + new URLSearchParams({ q: route.query });
    if (route.view === 'library') return route.tab === 'history' ? '#library?tab=history' : '#library';
    return '#home';
  };
  let lastList = '#home';
  try { lastList = normalize(storage?.getItem(key)); } catch { /* Returning to a list remains available without storage. */ }
  const validKey = value => typeof value === 'string' && /^[^\s]{1,300}\|(?:\d{4})?$/.test(value);
  const cleanTop = value => Number.isFinite(value) && value >= 0 && value <= 1000000 ? value : 0;
  const cleanAnchor = (anchor, controls) => validKey(anchor?.key) && Number.isFinite(anchor.offset) && Math.abs(anchor.offset) <= 10000
    ? { key: anchor.key, offset: anchor.offset, focus: controls.includes(anchor.focus) ? anchor.focus : '' } : null;
  const cleanCatalog = value => {
    if (!value || typeof value !== 'object') return null;
    const hash = normalize(value.hash);
    if (!['browse', 'search'].includes(parseRoute(hash).view)) return null;
    const filters = value.filters || {}; const pages = {};
    for (const source of SOURCES) {
      const page = value.pages?.[source.id];
      if (Number.isInteger(page) && page >= 0 && page <= 20) pages[source.id] = page;
    }
    return {
      hash, filters: { year: typeof filters.year === 'string' && /^\d{4}$/.test(filters.year) ? filters.year : '', area: Object.hasOwn(FILTER_AREAS, filters.area) ? filters.area : '', status: ['complete', 'updating'].includes(filters.status) ? filters.status : '' },
      top: cleanTop(value.top),
      anchor: cleanAnchor(value.anchor, ['poster', 'title', 'favorite']),
      pages, sources: SOURCES.filter(source => Array.isArray(value.sources) && value.sources.includes(source.id)).map(source => source.id), expanded: value.expanded === true,
    };
  };
  const copyCatalog = value => value ? { ...value, filters: { ...value.filters }, pages: { ...value.pages }, sources: [...value.sources], anchor: value.anchor ? { ...value.anchor } : null } : null;
  const catalogs = new Map();
  const retainCatalog = value => {
    if (!value) return;
    catalogs.delete(value.hash); catalogs.set(value.hash, value);
    if (catalogs.size > 8) catalogs.delete(catalogs.keys().next().value);
  };
  try {
    const saved = storage?.getItem(catalogKey);
    if (typeof saved === 'string' && saved.length <= 32768) {
      const parsed = JSON.parse(saved);
      const entries = parsed?.version === 2 && Array.isArray(parsed.entries) ? parsed.entries.slice(-8)
        : !Object.hasOwn(parsed ?? {}, 'version') && saved.length <= 4096 ? [parsed] : [];
      for (const entry of entries) retainCatalog(cleanCatalog(entry));
    }
  } catch { /* Ignore unavailable or corrupt catalogue state. */ }
  const cleanHome = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const anchor = cleanAnchor(value.anchor, ['poster', 'title', 'favorite', 'continue']);
    const section = value.anchor?.section;
    return {
      top: cleanTop(value.top), hero: validKey(value.hero) ? value.hero : '',
      control: ['hero-play', 'hero-detail'].includes(value.control) ? value.control : '',
      anchor: anchor && ['picks', 'short', 'tv', 'movie', 'continue'].includes(section) ? { ...anchor, section } : null,
    };
  };
  const copyHome = value => value ? { ...value, anchor: value.anchor ? { ...value.anchor } : null } : null;
  let home = null;
  try {
    const saved = storage?.getItem(homeKey);
    if (typeof saved === 'string' && saved.length <= 2048) home = cleanHome(JSON.parse(saved));
  } catch { /* Ignore unavailable or corrupt home state. */ }
  return {
    get: () => lastList,
    remember(hash) {
      lastList = normalize(hash);
      try { storage?.setItem(key, lastList); } catch { /* Preserve this tab's in-memory return route. */ }
      return lastList;
    },
    catalog(hash) { return copyCatalog(catalogs.get(normalize(hash))); },
    rememberCatalog(hash, context = {}) {
      const catalog = cleanCatalog({ ...context, hash });
      if (!catalog) return null;
      retainCatalog(catalog);
      try { storage?.setItem(catalogKey, JSON.stringify({ version: 2, entries: [...catalogs.values()] })); } catch { /* Retain the current tab's state without persistence. */ }
      return copyCatalog(catalog);
    },
    home: () => copyHome(home),
    rememberHome(context = {}) {
      home = cleanHome(context);
      try { storage?.setItem(homeKey, JSON.stringify(home)); } catch { /* Keep the current tab's home position available. */ }
      return copyHome(home);
    },
  };
}

export function filterVideos(videos, { year = '', area = '', status = '' } = {}) {
  return videos.filter(item => {
    if (year && item.year !== year) return false;
    if (area && (!Object.hasOwn(FILTER_AREAS, area) || !FILTER_AREAS[area].test(item.area || ''))) return false;
    const complete = /已完结|全\d+|\d+集全|完结|全集|全剧集|HD|高清|正片|蓝光/i.test(item.remarks || '');
    if (status === 'complete' && !complete) return false;
    if (status === 'updating' && (complete || !/更新|连载|^至\d+集/.test(item.remarks || ''))) return false;
    return true;
  });
}

export function episodeRanges(length, size = 30) {
  if (!Number.isInteger(length) || length <= 0 || !Number.isInteger(size) || size <= 0) return [];
  return Array.from({ length: Math.ceil(length / size) }, (_, index) => ({ start: index * size, end: Math.min(length, (index + 1) * size) }));
}

export function safeURL(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function plainText(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|emsp|ensp);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

export function parseUpdateSchedule(value, weekdayField = false) {
  const text = plainText(value).slice(0, 5000);
  const explicit = text.match(/(?:(?:每周|每週|每星期)[一二三四五六日天]|每天|每日)[一二三四五六日天、,，/至到周星期和及\d\s:：点分上午下中晚早晨间-]{0,40}(?:更新|播出|上线)(?:\s*\d+\s*集)?/);
  if (explicit) return explicit[0].replace(/每週/, '每周').trim();
  const compact = [...text.matchAll(/(?:^|[\s，,。；;])(?:星期|周)([一二三四五六日天])\s*(?:更新|更)\s*([1-9]\d?)\s*(?:集)?(?=$|[\s，,。；;])/g)];
  if (compact.length) return [...new Set(compact.map(match => '每周' + match[1].replace('天', '日') + '更新' + match[2] + '集'))].slice(0, 7).join('；');
  // Bare weekday names are accepted only from the dedicated weekday field.
  if (weekdayField && /^(?:(?:每周|每星期|周|星期)?[一二三四五六日天])(?:[、,，/\s]+(?:周|星期)?[一二三四五六日天])*$/.test(text)) {
    const days = [...new Set(text.replace(/每周|每星期|星期|周/g, '').replace(/天/g, '日').match(/[一二三四五六日]/g))];
    return '每周' + days.join('、') + '更新';
  }
  if (weekdayField && /^(?:(?:每周|每星期|周|星期)?[一二三四五六日天])/.test(text)) {
    const candidate = text.replace(/^(?:每周|每星期|星期|周)?(?=[一二三四五六日天])/, '每周');
    return parseUpdateSchedule(candidate + '更新');
  }
  return '';
}

export function releaseSchedule(item, overrides = [], today = new Date().toISOString().slice(0, 10)) {
  const unknown = { label: '暂无更新安排', credit: '', url: '', note: '' };
  if (item.isComplete) return { ...unknown, label: /电影|片$/.test(item.category || '') ? '已上线' : '已完结' };
  if (item.updateSchedule) return { ...unknown, label: item.updateSchedule, credit: sourceLabel(item) + '提供' };
  const entry = (Array.isArray(overrides) ? overrides : []).find(value => value && value.title === item.title && value.year === item.year && /^\d{4}-\d{2}-\d{2}$/.test(value.validUntil || '') && value.validUntil >= today);
  if (!entry) return unknown;
  const label = parseUpdateSchedule(entry.schedule);
  return label ? { label, credit: plainText(entry.sourceName), url: safeURL(entry.sourceURL), note: plainText(entry.note) } : unknown;
}

export function parseLines(from, urls) {
  const names = String(from ?? '').split('$$$');
  return String(urls ?? '').split('$$$').map((group, index) => {
    const episodes = group.split('#').map((item, i) => {
      const divider = item.indexOf('$');
      const url = safeURL(divider < 0 ? item : item.slice(divider + 1));
      if (!url || !/\.(m3u8|mp4)(?:$|\?)/i.test(new URL(url).pathname + new URL(url).search)) return null;
      return { name: plainText(divider < 0 ? `第${i + 1}集` : item.slice(0, divider)), url };
    }).filter(Boolean);
    return { name: names[index] || `线路 ${index + 1}`, episodes };
  }).filter(line => line.episodes.length);
}

export function normalizeVideo(raw, source) {
  if (!raw || !SOURCES.some(item => item.id === source)) return null;
  const id = String(raw.vod_id ?? '');
  const title = plainText(raw.vod_name);
  const category = plainText(raw.type_name);
  if (!validVideoId(source, id) || !title || /伦理|色情|福利|写真|里番|成人|解说|预告/.test(category + title)) return null;
  const aliases = { ruyi: 'ruyi', ffzy: 'feifan', lzi: 'liangzi', lzzy: 'liangzi' };
  const origin = source === 'zip0' ? aliases[id.split(':')[0]] || 'zip0:' + id.split(':')[0] : source;
  const lines = Array.isArray(raw.vod_lines) && ['auete', 'pianku'].includes(source) ? raw.vod_lines.map(line => ({
    name: plainText(line.name), episodes: (Array.isArray(line.episodes) ? line.episodes : []).filter(item => /^\d{1,4}-\d{1,4}$/.test(item.ref || '')).map(item => ({ name: plainText(item.name), ref: item.ref })),
  })).filter(line => line.episodes.length) : parseLines(raw.vod_play_from, raw.vod_play_url);
  const remarks = plainText(raw.vod_remarks); const description = plainText(raw.vod_content);
  return {
    id, source, origin, uid: `${source}:${id}`, title,
    year: plainText(raw.vod_year), area: plainText(raw.vod_area), category, updatedAt: plainText(raw.vod_time),
    poster: safeURL(raw.vod_pic), remarks, description,
    updateSchedule: parseUpdateSchedule(raw.vod_weekday, true) || parseUpdateSchedule(remarks) || parseUpdateSchedule(description),
    isComplete: raw.vod_isend === 1 || raw.vod_isend === '1' || Boolean(filterVideos([{ remarks }], { status: 'complete' }).length),
    actors: plainText(raw.vod_actor),
    director: plainText(raw.vod_director), lines,
  };
}

export function normalizeResponse(data, source) {
  if (!data || !Array.isArray(data.list)) throw new Error('来源返回的数据格式不正确');
  const seen = new Set();
  return data.list.map(raw => normalizeVideo(raw, source)).filter(item => {
    if (!item || seen.has(item.uid)) return false;
    seen.add(item.uid); return true;
  });
}

export function groupVideos(videos) {
  const groups = new Map();
  for (const video of videos) {
    const key = videoKey(video);
    if (!groups.has(key)) groups.set(key, { key, ...video, variants: [] });
    const group = groups.get(key);
    const duplicate = group.variants.findIndex(item => item.uid === video.uid || (item.origin && item.origin === video.origin && (item.source === 'zip0' || video.source === 'zip0')));
    if (duplicate < 0) group.variants.push(video);
    else if (video.source === video.origin) group.variants[duplicate] = video;
  }
  return [...groups.values()];
}

export function matchEpisode(episodes, previousName, previousIndex = 0) {
  if (!episodes.length) return -1;
  const exact = episodes.findIndex(item => item.name === previousName);
  if (exact >= 0) return exact;
  const number = String(previousName ?? '').match(/\d+/)?.[0];
  const numeric = number === undefined ? -1 : episodes.findIndex(item => Number(item.name.match(/\d+/)?.[0]) === Number(number));
  return numeric >= 0 ? numeric : Math.min(Math.max(previousIndex, 0), episodes.length - 1);
}

export function episodeNumber(name) {
  const match = plainText(name).match(/^(?:第\s*|EP\s*)?0*(\d{1,4})\s*(?:集|话|話|期)?$/i);
  return match && Number(match[1]) > 0 ? Number(match[1]) : null;
}

export function nextEpisode(index, length) {
  return Number.isInteger(index) && index >= 0 && index + 1 < length ? index + 1 : -1;
}

export async function requestVideos(source, { query = '', id = '', page = 1, mode = '', category = 'tv', type, base = '', signal, fetchImpl = fetch } = {}) {
  if (!SOURCES.some(item => item.id === source)) throw new Error('未知的影片来源');
  const params = new URLSearchParams({ source, page: String(page) });
  if (id) params.set('id', id);
  else if (mode === 'browse') {
    params.set('mode', 'browse'); params.set('category', category);
    if (type !== undefined) params.set('type', String(type));
  } else params.set('q', query);
  const response = await fetchImpl(`${base.replace(/\/$/, '')}/api/vod?${params}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('查询服务没有返回有效数据'); }
  if (!response.ok) throw new Error(data.error || '暂时无法连接这个来源');
  return { videos: normalizeResponse(data, source), pages: Math.min(20, Math.max(1, Number(data.pagecount) || 1)), limited: Number(data.pagecount) > 20 };
}

export async function requestEpisode(source, id, line, episode, { base = '', signal, fetchImpl = fetch } = {}) {
  if (!validVideoId(source, id) || !['auete', 'pianku'].includes(source) || ![line, episode].every(index => Number.isInteger(index) && index >= 0 && index < 10000)) throw new Error('剧集参数不正确');
  const params = new URLSearchParams({ source, id, line: String(line), episode: String(episode) });
  const response = await fetchImpl(`${base.replace(/\/$/, '')}/api/play?${params}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('查询服务没有返回有效数据'); }
  const url = safeURL(data.url);
  if (!response.ok || !url || !/\.(m3u8|mp4)$/i.test(new URL(url).pathname)) throw new Error('未能取得播放地址，请换一条线路');
  return url;
}

export function loadSaved(storage, key, fallback = []) {
  try {
    const data = storage.getItem(key);
    if (data === null) return [];
    const items = JSON.parse(data);
    if (!Array.isArray(items)) return fallback;
    return items.filter(item => item && typeof item.uid === 'string' && validVideoId(item.source, item.id)
      && SOURCES.some(source => source.id === item.source) && typeof item.title === 'string').slice(0, 100);
  } catch { return fallback; }
}

export function saveItems(storage, key, items) {
  try { storage.setItem(key, JSON.stringify(items.slice(0, 100))); return true; } catch { return false; }
}

export function mergeSavedItems(previous = [], next = [], latest = []) {
  if (![previous, next, latest].every(Array.isArray)) throw new Error('记录列表格式不正确');
  const index = items => new Map(items.slice(0, 100).filter(item => item && typeof item.title === 'string' && typeof item.uid === 'string' && validVideoId(item.source, item.id)).map(item => [videoKey(item), item]));
  const before = index(previous); const local = index(next); const current = index(latest);
  const byUID = entries => new Map([...entries.values()].map(item => [item.uid, item]));
  const beforeUID = byUID(before); const localUID = byUID(local); const currentUID = byUID(current);
  const changed = new Map();
  try {
    for (const [key, item] of local) {
      // A refresh must not resurrect a favorite removed in another tab.
      const original = before.get(key) || beforeUID.get(item.uid);
      if (original && !current.has(key) && !currentUID.has(item.uid)) continue;
      const serialized = JSON.stringify(item);
      if (!original || serialized !== JSON.stringify(original)) changed.set(key, item);
    }
  } catch { throw new Error('记录内容无法保存'); }
  const changedUID = byUID(changed);
  const retained = [...current].filter(([key, item]) => !changed.has(key) && !changedUID.has(item.uid)
    && ((!before.has(key) && !beforeUID.has(item.uid)) || local.has(key) || localUID.has(item.uid))).map(([, item]) => item);
  return [...changed.values(), ...retained].slice(0, 100);
}

export function rememberProgress(history, video, episode, position, duration) {
  const time = Number(position);
  const length = Number(duration);
  const record = {
    uid: video.uid, id: video.id, source: video.source, title: video.title, poster: video.poster,
    year: video.year, episode: plainText(episode), position: Number.isFinite(time) ? Math.max(0, time) : 0,
    duration: Number.isFinite(length) ? Math.max(0, length) : 0, updatedAt: Date.now(),
    category: video.category, area: video.area,
  };
  if (['单条视频', '整部合集', '单部影片'].includes(video.playbackLabel)) record.playbackLabel = video.playbackLabel;
  return [record, ...history.filter(item => videoKey(item) !== videoKey(record))].slice(0, 100);
}
