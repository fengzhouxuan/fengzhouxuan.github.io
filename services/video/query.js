import { SOURCES, CATEGORIES, supportsSource, plainText, sameEpisodeName } from './core.js';
import { buildAdapterRequest, parsePianku, parseAuete, parseZipSearch, parseZipDetail, buildEpisodePage, parseEpisodeURL } from './adapters.js';

export function buildUpstream(params) {
  const source = SOURCES.find(item => item.id === params.get('source'));
  if (!source?.api) throw new Error('未知的影片来源');
  const id = params.get('id');
  const query = (params.get('q') || '').trim();
  const page = Number(params.get('page') || 1);
  const browse = params.get('mode') === 'browse';
  if (id && !/^\d{1,12}$/.test(id)) throw new Error('影片编号不正确');
  if (!id && !browse && (!query || query.length > 80)) throw new Error('请输入 1–80 个字的片名');
  if (!Number.isInteger(page) || page < 1 || page > 20) throw new Error('页码不正确');
  const url = new URL(source.api);
  url.searchParams.set('ac', 'detail');
  if (id) url.searchParams.set('ids', id);
  else if (browse) {
    const category = CATEGORIES.find(item => item.id === params.get('category'));
    const type = Number(params.get('type') || category?.types[0][0]);
    if (!category || !category.types.some(item => item[0] === type)) throw new Error('影片分类不正确');
    if (!supportsSource(source, { view: 'browse', type })) throw new Error('这个来源不支持当前细分类别，可使用其他来源');
    url.searchParams.set('t', String(source.browseTypeMap?.[type] ?? type));
  } else url.searchParams.set('wd', query);
  url.searchParams.set('pg', String(page));
  return url;
}

export function createVideoQuery({ fetchImpl = fetch, upstreamTimeout = 10000 } = {}) {
  const cache = new Map();
  async function cached(key, lifetime, read) {
    const item = cache.get(key);
    if (item && item.expires > Date.now()) return item.data;
    const data = await read();
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { data, expires: Date.now() + lifetime });
    return data;
  }
  async function readUpstream(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(upstreamTimeout), redirect: 'manual' });
    if (!response.ok) throw new Error('upstream HTTP error');
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) throw new Error('upstream response too large');
    return text;
  }
  function readAdapter(request) {
    return cached(request.url.href, request.id && request.source === 'zip0' ? 60000 : 300000, async () => {
      const html = await readUpstream(request.url);
      if (request.source === 'pianku') return parsePianku(html, request);
      if (request.source === 'auete') return parseAuete(html, request);
      return request.id ? parseZipDetail(html, request.id) : parseZipSearch(JSON.parse(html));
    });
  }
  return async (request, { allowedOrigins = [] } = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
    const origin = request.headers.get('Origin');
    if (origin && allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
    const send = (status, data) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
    try {
      if (request.method === 'OPTIONS') return send(204);
      if (request.method !== 'GET') return send(405, { error: '仅支持读取请求' });
      const url = new URL(request.url);
      if (url.pathname === '/healthz') return send(200, { service: 'videostation-api', status: 'ok' });
      if (url.pathname === '/api/play') {
        let adapter; let ref; let name;
        try {
          const params = url.searchParams;
          if (!['pianku', 'auete'].includes(params.get('source')) || !params.get('id')) throw new Error('剧集参数不正确');
          adapter = buildAdapterRequest(params);
          ref = params.get('ref'); name = plainText(params.get('name'));
          if (!ref && params.has('episode')) throw new Error('播放页面已更新，请刷新页面后重试');
          if (!/^\d{1,4}-\d{1,4}$/.test(ref || '') || !name || name.length > 120) throw new Error('剧集参数不正确');
        } catch (error) { return send(400, { error: error.message }); }
        try {
          const detail = await readAdapter(adapter);
          const episode = detail.list[0]?.vod_lines?.flatMap(line => line.episodes).find(value => value.ref === ref && sameEpisodeName(value.name, name));
          if (!episode) return send(404, { error: '来源的剧集目录已变化，请重新获取影片信息或选择其他线路' });
          const page = buildEpisodePage(adapter.source, adapter.id, ref);
          const address = await cached('play:' + page.href, 30000, async () => ({ url: parseEpisodeURL(adapter.source, await readUpstream(page)) }));
          return send(200, address);
        } catch { return send(502, { error: '这条线路暂时无法解析，请切换来源或稍后重试' }); }
      }
      if (url.pathname === '/api/vod') {
        if (SOURCES.some(item => item.id === url.searchParams.get('source') && item.site)) {
          let adapter;
          try { adapter = buildAdapterRequest(url.searchParams); } catch (error) { return send(400, { error: error.message }); }
          try { return send(200, await readAdapter(adapter)); }
          catch { return send(502, { error: '这个来源暂时无法读取，可能要求验证或页面已变化，请切换来源' }); }
        }
        let upstream;
        try { upstream = buildUpstream(url.searchParams); } catch (error) { return send(400, { error: error.message }); }
        try {
          const data = await cached(upstream.href, 300000, async () => {
            const result = JSON.parse(await readUpstream(upstream));
            if (!Array.isArray(result.list)) throw new Error('upstream format error');
            return result;
          });
          return send(200, data);
        } catch { return send(502, { error: '这个来源暂时无法连接，请切换来源或稍后重试' }); }
      }
      return send(404, { error: '页面不存在' });
    } catch { return send(500, { error: '查询服务暂时无法读取' }); }
  };
}
