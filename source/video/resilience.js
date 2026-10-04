import { SOURCES, CATEGORIES } from './core.js';

const cacheKey = 'video-query-cache-v1';
const pauseKey = 'video-backend-pause-v1';
const lifetime = 24 * 60 * 60 * 1000;
const jsonResponse = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function createBackendTransport({ base = '', storage = null, fetchImpl = fetch, now = Date.now, onChange = () => {} } = {}) {
  const endpoint = base.replace(/\/$/, '');
  const cache = new Map();
  const state = { phase: 'ready', retryAt: 0, cached: 0, direct: 0 };
  let generation = 0;
  try {
    const entries = JSON.parse(storage?.getItem(cacheKey) || '[]');
    for (const entry of Array.isArray(entries) ? entries.slice(-24) : []) {
      if (typeof entry?.key === 'string' && entry.key.startsWith('/api/vod?') && typeof entry.text === 'string' && entry.text.length <= 200000 && Number.isFinite(entry.at) && entry.at <= now() && now() - entry.at < lifetime && Array.isArray(JSON.parse(entry.text)?.list)) cache.set(entry.key, entry);
    }
  } catch { /* A corrupt or unavailable cache does not block live queries. */ }
  try {
    const pause = JSON.parse(storage?.getItem(pauseKey) || 'null');
    if (['limited', 'unavailable'].includes(pause?.phase) && pause.retryAt > now() && pause.retryAt <= now() + lifetime) Object.assign(state, { phase: pause.phase, retryAt: pause.retryAt });
  } catch { /* Keep the current tab usable without persistent storage. */ }

  function pause(phase, retryAfter = 60) {
    const tomorrow = (Math.floor(now() / lifetime) + 1) * lifetime + 1000;
    if (state.phase !== 'limited') Object.assign(state, { phase, retryAt: phase === 'limited' ? tomorrow : now() + Math.min(3600, Math.max(5, retryAfter)) * 1000 });
    try { storage?.setItem(pauseKey, JSON.stringify({ phase: state.phase, retryAt: state.retryAt })); } catch { /* The in-memory circuit still prevents repeated calls. */ }
    onChange(state);
  }
  function remember(key, text) {
    if (text.length > 200000) return;
    cache.delete(key); cache.set(key, { key, text, at: now() });
    let size = [...cache.values()].reduce((total, entry) => total + entry.text.length, 0);
    while (cache.size > 24 || size > 1000000) { const first = cache.keys().next().value; size -= cache.get(first).text.length; cache.delete(first); }
    try { storage?.setItem(cacheKey, JSON.stringify([...cache.values()])); } catch { /* Retain bounded current-tab results when the browser is full. */ }
  }
  function directURL(url) {
    if (url.pathname !== '/api/vod') return null;
    const params = url.searchParams;
    // This provider permits browser CORS. Other providers stay behind the service.
    const source = SOURCES.find(item => item.id === params.get('source') && item.id === 'liangzi');
    if (!source) return null;
    const target = new URL(source.api); target.searchParams.set('ac', 'detail');
    if (params.has('id')) target.searchParams.set('ids', params.get('id'));
    else if (params.get('mode') === 'browse') {
      const category = CATEGORIES.find(item => item.id === params.get('category'));
      const type = Number(params.get('type') || category?.types[0][0]);
      if (!category?.types.some(item => item[0] === type)) return null;
      target.searchParams.set('t', String(type));
    } else target.searchParams.set('wd', params.get('q') || '');
    target.searchParams.set('pg', params.get('page') || '1'); return target;
  }
  async function fallback(url, options) {
    const key = url.pathname + url.search;
    const direct = directURL(url);
    if (direct) {
      try {
        const directSignal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
        const response = await fetchImpl(direct.href, { signal: directSignal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        const text = await response.text();
        if (response.ok && text.length <= 2 * 1024 * 1024 && Array.isArray(JSON.parse(text)?.list)) {
          remember(key, text); state.direct++; onChange(state);
          return new Response(text, { headers: { 'Content-Type': 'application/json', 'X-Video-Fallback': 'direct' } });
        }
      } catch (error) { if (options.signal?.aborted) throw error; }
    }
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
    const entry = cache.get(key);
    if (entry && now() - entry.at < lifetime) {
      state.cached++; onChange(state);
      return new Response(entry.text, { headers: { 'Content-Type': 'application/json', 'X-Video-Fallback': 'cache', 'X-Video-Cached-At': String(entry.at) } });
    }
    return jsonResponse({ code: state.phase === 'limited' ? 'backend_quota' : 'backend_unavailable', error: '云端暂时不可用；本地收藏仍可使用，部分来源可直连，已有目录可从缓存读取' }, 503, { 'Retry-After': String(Math.max(1, Math.ceil((state.retryAt - now()) / 1000))) });
  }
  async function request(input, options = {}) {
    const url = new URL(String(input), endpoint || 'http://localhost');
    const query = url.pathname === '/api/vod' || url.pathname === '/api/play';
    if (url.origin !== new URL(endpoint || 'http://localhost').origin) throw new Error('服务地址不正确');
    if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
    if (state.retryAt > now()) return query ? fallback(url, options) : jsonResponse({ code: 'backend_unavailable', error: '云端暂时不可用，收藏已保留在本机，恢复后可继续同步' }, 503);
    const current = generation;
    try {
      // Let a provider's deadline return its isolated 502 before declaring the service unavailable.
      // Lazy playback may read both the detail page and the episode page, each with its own deadline.
      const timeout = url.pathname === '/api/play' ? 25000 : url.pathname === '/api/vod' ? 15000 : 10000;
      const deadline = AbortSignal.timeout(timeout);
      const networkSignal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      const response = await fetchImpl(input, { ...options, signal: networkSignal });
      const text = await response.clone().text();
      let data; try { data = JSON.parse(text); } catch { /* Platform error pages may be HTML or plain text. */ }
      const quota = !response.ok && /(?:error(?: code)?\s*[:：]?\s*1027|\bcode["'\s:]*1027\b)/i.test(text) || data?.code === 'backend_quota';
      const broken = quota || response.status === 429 || response.status >= 500 && !(response.status === 502 && typeof data?.error === 'string') && !(url.pathname.startsWith('/api/account/') && typeof data?.code === 'string') || response.ok && (query ? !data || (url.pathname === '/api/vod' ? !Array.isArray(data.list) : typeof data.url !== 'string') : !data);
      if (broken) {
        if (current === generation) pause(quota ? 'limited' : 'unavailable', Number(response.headers.get('Retry-After')) || 60);
        return query ? fallback(url, options) : jsonResponse({ code: 'backend_unavailable', error: '云端暂时不可用，收藏已保留在本机，恢复后可继续同步' }, 503);
      }
      if (response.ok && query && url.pathname === '/api/vod') remember(url.pathname + url.search, text);
      if (response.ok && current === generation && state.retryAt <= now()) {
        Object.assign(state, { phase: 'ready', retryAt: 0 });
        try { storage?.removeItem(pauseKey); } catch { /* Recovery remains effective for this tab. */ }
        onChange(state);
      }
      return response;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (current === generation) pause('unavailable');
      return query ? fallback(url, options) : jsonResponse({ code: 'backend_unavailable', error: '云端暂时不可用，收藏已保留在本机，恢复后可继续同步' }, 503);
    }
  }
  async function retry() {
    generation++; Object.assign(state, { phase: 'ready', retryAt: 0 });
    const response = await request((endpoint || '') + '/healthz');
    return response.ok;
  }
  return { state, fetch: request, retry };
}
