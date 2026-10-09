import { Buffer } from 'node:buffer';
import { SOURCES, CATEGORIES, validVideoId, safeURL, plainText } from './core.js';

const piankuTypes = { 6: 21, 7: 22, 8: 23, 9: 24, 10: 25, 11: 26, 12: 27, 20: 35, 13: 38, 16: 40 };
const aueteTypes = { 6: 'Movie/dzp', 7: 'Movie/xjp', 8: 'Movie/aqp', 9: 'Movie/khp', 10: 'Movie/kbp', 11: 'Movie/jqp', 12: 'Movie/zzp', 13: 'Tv/neidi', 14: 'Tv/tvbgj', 15: 'Tv/hanju', 16: 'Tv/oumei', 21: 'Tv/taiju', 22: 'Tv/riju', 23: 'Tv/waiju', 24: 'Tv/yataiju', 25: 'Zy/guozong', 27: 'Zy/hanzong', 28: 'Zy/meizong', 29: 'Dm/guoman', 30: 'Dm/riman', 31: 'Dm/meiman' };

function attribute(tag, name) {
  return tag.match(new RegExp('\\b' + name + '=["\x27]([^"\x27]*)["\x27]', 'i'))?.[1] || '';
}

function classContent(html, className, tag = '[a-z0-9]+') {
  return html.match(new RegExp('<(' + tag + ')\\b[^>]*class=["\x27][^"\x27]*\\b' + className + '\\b[^"\x27]*["\x27][^>]*>([\\s\\S]*?)<\\/\\1>', 'i'))?.[2] || '';
}

function imageURL(html, site) {
  const tag = html.match(/<img\b[^>]*>/i)?.[0] || '';
  const value = attribute(tag, 'data-original') || attribute(tag, 'src');
  if (!value) return '';
  const url = new URL(plainText(value), site);
  if (url.hostname === 'www.aeete.com' && url.pathname === '/img.php') return safeURL(url.searchParams.get('url'));
  return safeURL(url);
}

function field(html, label) {
  return plainText(html.match(new RegExp(label + '：(?:<\\/span>)?\\s*([\\s\\S]*?)(?:<\\/p>|<\\/span>)'))?.[1] || '');
}

function pageCount(html, pattern) {
  return Math.max(1, ...[...html.matchAll(pattern)].map(match => Number(match[1] || match[2])));
}

function ensurePage(html, marker) {
  if (!html.includes(marker)) throw new Error('来源页面结构已变化或要求验证');
}

export function buildAdapterRequest(params) {
  const source = SOURCES.find(item => item.id === params.get('source') && item.site);
  if (!source) throw new Error('未知的页面来源');
  const id = params.get('id'); const query = (params.get('q') || '').trim();
  const page = Number(params.get('page') || 1); const browse = params.get('mode') === 'browse';
  if (!Number.isInteger(page) || page < 1 || page > 20) throw new Error('页码不正确');
  if (id) {
    if (!validVideoId(source.id, id)) throw new Error('影片编号不正确');
    if (source.id === 'pianku') return { source: source.id, id, url: new URL('/voddetail/' + id + '.html', source.site) };
    if (source.id === 'auete') return { source: source.id, id, url: new URL('/' + id + '/', source.site) };
    const [upstream, number] = id.split(':');
    return { source: source.id, id, url: new URL('/watch?' + new URLSearchParams({ source: upstream, id: number, episode: '1' }), source.site) };
  }
  if (browse) {
    const category = CATEGORIES.find(item => item.id === params.get('category'));
    const type = Number(params.get('type') || category?.types[0][0]);
    if (!category?.types.some(item => item[0] === type) || !source.browseTypes.includes(type)) throw new Error('这个来源不支持当前细分类别，可使用其他来源');
    const path = source.id === 'pianku' ? '/vodtype/' + piankuTypes[type] + (page === 1 ? '' : '-' + page) + '.html' : '/' + aueteTypes[type] + '/index' + (page === 1 ? '' : page) + '.html';
    return { source: source.id, page, category: category.types.find(item => item[0] === type)[1], url: new URL(path, source.site) };
  }
  if (!query || query.length > (source.id === 'zip0' ? 60 : 80)) throw new Error('片名长度不正确');
  if (source.search === false) throw new Error('Auete 搜索要求验证，请从分类浏览进入');
  const path = source.id === 'zip0' ? '/api/videos/search?' + new URLSearchParams({ query, page: String(page), limit: '20' }) : '/vodsearch/-------------.html?' + new URLSearchParams({ wd: query, page: String(page) });
  return { source: source.id, page, url: new URL(path, source.site) };
}

export function parsePianku(html, { id = '', category = '' } = {}) {
  if (!id) {
    ensurePage(html, 'vod-grid');
    const list = [...html.matchAll(/<a\b([^>]*href=["']\/voddetail\/\d+\.html["'][^>]*)>([\s\S]*?)<\/a>/g)].map(match => {
      const subtitle = plainText(classContent(match[2], 'subtitle')).split('/').map(item => item.trim());
      const year = subtitle.find(value => /^\d{4}$/.test(value)) || '';
      const area = /^\d{4}$/.test(subtitle[0]) ? subtitle[1] : '';
      return { vod_id: attribute(match[1], 'href').match(/\d+/)[0], vod_name: attribute(match[1], 'title') || plainText(classContent(match[2], 'title')),
        vod_pic: imageURL(match[2], 'https://4k01.pianku.online'), vod_remarks: plainText(classContent(match[2], 'remarks')), vod_year: year, vod_area: area, type_name: category };
    });
    return { list, pagecount: pageCount(html, /(?:\/vodtype\/\d+-(\d+)\.html|[?&]page=(\d+))/g) };
  }
  ensurePage(html, 'detail-title');
  const title = classContent(html, 'detail-title', 'h1').split('<span')[0];
  const names = new Map([...html.matchAll(/<span\b[^>]*data-target=["']playlist-(\d+)["'][^>]*>([\s\S]*?)<\/span>/g)].map(match => [match[1], plainText(match[2])]));
  const lines = [...html.matchAll(/<div\b[^>]*id=["']playlist-(\d+)["'][^>]*>([\s\S]*?)<\/div>/g)].map(match => ({
    name: names.get(match[1]) || '片库线路 ' + match[1],
    episodes: [...match[2].matchAll(/<a\b[^>]*href=["']\/vodplay\/(\d+)-(\d+)-(\d+)\.html["'][^>]*>([\s\S]*?)<\/a>/g)].filter(ep => ep[1] === id).map(ep => ({ name: plainText(ep[4]), ref: ep[2] + '-' + ep[3] })),
  })).filter(line => line.episodes.length);
  return { list: [{ vod_id: id, vod_name: plainText(title), vod_pic: imageURL(classContent(html, 'detail-poster', 'div'), 'https://4k01.pianku.online'),
    vod_year: field(html, '年份'), vod_area: field(html, '地区'), type_name: field(html, '分类'), vod_actor: field(html, '主演'), vod_director: field(html, '导演'),
    vod_remarks: plainText(classContent(html, 'detail-remarks')), vod_content: plainText(classContent(html, 'detail-desc', 'div').replace(/<h3[\s\S]*?<\/h3>/, '')), vod_lines: lines }], pagecount: 1 };
}

export function parseAuete(html, { id = '', category = '' } = {}) {
  if (!id) {
    ensurePage(html, 'threadlist');
    const list = [...html.matchAll(/<li\b([^>]*data-href=["'][^"']+["'][^>]*)>([\s\S]*?)<\/li>/g)].map(match => {
      const path = attribute(match[1], 'data-href').replace(/^\//, '').replace(/\/$/, '');
      const img = match[2].match(/<img\b[^>]*>/)?.[0] || '';
      return { vod_id: path, vod_name: attribute(img, 'alt'), vod_pic: imageURL(match[2], 'https://www.aeete.com'), vod_remarks: plainText(classContent(match[2], 'hdtag')), type_name: category };
    }).filter(item => validVideoId('auete', item.vod_id));
    return { list, pagecount: pageCount(html, /index(\d+)\.html/g) };
  }
  ensurePage(html, 'detail-title');
  const grouped = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+\/play-(\d+)-(\d+)\.html)["'][^>]*>([\s\S]*?)<\/a>/g)) {
    if (match[1] !== '/' + id + '/play-' + match[2] + '-' + match[3] + '.html') continue;
    if (!grouped.has(match[2])) grouped.set(match[2], { name: 'Auete 线路 ' + (Number(match[2]) + 1), episodes: [] });
    const line = grouped.get(match[2]); const ref = match[2] + '-' + match[3];
    if (!line.episodes.some(item => item.ref === ref)) line.episodes.push({ name: plainText(match[4]), ref });
  }
  const status = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bdetail-status-item\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/g)].map(match => plainText(match[1]));
  const updatedAt = status.find(value => /^更新\s*[：:]/.test(value))?.replace(/^更新\s*[：:]\s*/, '') || '';
  return { list: [{ vod_id: id, vod_name: plainText(classContent(html, 'detail-title', 'h1')).replace(/^《|》$/g, ''), vod_pic: imageURL(classContent(html, 'detail-poster', 'div'), 'https://www.aeete.com'),
    vod_year: plainText(classContent(html, 'badge-time', 'span')), vod_area: plainText(classContent(html, 'badge-area', 'span')), type_name: plainText(classContent(html, 'badge-type', 'span')),
    vod_actor: field(html, '影片主演'), vod_director: field(html, '影片导演'), vod_remarks: field(html, '影片备注'), vod_time: updatedAt, vod_content: plainText(classContent(html, 'detail-des', 'p')), vod_lines: [...grouped.values()] }], pagecount: 1 };
}

export function parseZipSearch(data) {
  if (!data.success || !Array.isArray(data.data)) throw new Error('ZIP0 返回的数据格式不正确');
  const list = data.data.flatMap(item => {
    let url; try { url = new URL(item.url); } catch { return []; }
    const id = url.searchParams.get('source') + ':' + url.searchParams.get('id');
    if (url.origin !== 'https://zip0.com' || url.pathname !== '/watch' || !validVideoId('zip0', id)) return [];
    return [{ vod_id: id, vod_name: item.title, vod_year: item.year, vod_area: item.area, type_name: item.category, vod_remarks: item.remarks, vod_time: item.updatedAt }];
  });
  return { list, pagecount: data.pagination?.pages || 1 };
}

function scriptString(script, key) {
  const value = script.match(new RegExp('(?:^|[,{])' + key + ':("(?:[^"\\\\]|\\\\.)*")'))?.[1];
  return value ? JSON.parse(value) : '';
}

export function parseZipDetail(html, id) {
  if (!validVideoId('zip0', id)) throw new Error('ZIP0 影片来源未登记');
  // Read only quoted values from the SSR payload; never execute remote JavaScript.
  const payload = html.match(/l:\$R\[\d+\]=\{id:"[\s\S]*?\},ssr:!0/)?.[0] || '';
  const upstream = scriptString(payload, 'source'); const number = scriptString(payload, 'id');
  if (upstream + ':' + number !== id) throw new Error('ZIP0 影片信息不匹配');
  const episodes = [...payload.matchAll(/\{name:("(?:[^"\\]|\\.)*"),url:("(?:[^"\\]|\\.)*")\}/g)].map(match => ({ name: JSON.parse(match[1]), url: JSON.parse(match[2]) }));
  return { list: [{ vod_id: id, vod_name: scriptString(payload, 'title'), vod_year: scriptString(payload, 'year'), vod_area: scriptString(payload, 'area'), type_name: scriptString(payload, 'category'),
    vod_pic: scriptString(payload, 'poster'), vod_remarks: scriptString(payload, 'remarks'), vod_actor: scriptString(payload, 'actors'), vod_director: scriptString(payload, 'director'), vod_content: scriptString(payload, 'description'),
    vod_play_from: 'ZIP0 · ' + upstream, vod_play_url: episodes.map(ep => ep.name + '$' + ep.url).join('#') }], pagecount: 1 };
}

export function buildEpisodePage(source, id, ref) {
  if (!validVideoId(source, id) || !/^\d{1,4}-\d{1,4}$/.test(ref)) throw new Error('剧集参数不正确');
  if (source === 'pianku') return new URL('/vodplay/' + id + '-' + ref + '.html', 'https://4k01.pianku.online');
  if (source === 'auete') return new URL('/' + id + '/play-' + ref + '.html', 'https://www.aeete.com');
  throw new Error('这个来源不需要页面解析');
}

export function parseEpisodeURL(source, html) {
  let value;
  if (source === 'pianku') {
    const json = html.match(/\bvar\s+player_aaaa\s*=\s*(\{[^\n]*?\})\s*<\/script>/)?.[1];
    if (!json) throw new Error('播放页面格式不正确');
    const player = JSON.parse(json);
    if (player.encrypt !== 0) throw new Error('这条线路没有公开直链');
    value = player.url;
  } else if (source === 'auete') {
    const encoded = html.match(/\bvar\s+now\s*=\s*base64decode\("([A-Za-z0-9+/=]+)"\)/)?.[1];
    if (!encoded) throw new Error('播放页面格式不正确');
    value = Buffer.from(encoded, 'base64').toString('utf8');
  }
  const url = safeURL(value);
  if (!url || !/\.(m3u8|mp4)$/i.test(new URL(url).pathname)) throw new Error('这条线路没有可播放的直链');
  return url;
}
