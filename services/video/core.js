export const SOURCES = [
  { id: 'liangzi', name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod' },
  { id: 'ruyi', name: '如意资源', api: 'https://cj.rycjapi.com/api.php/provide/vod', browseTypeMap: { 52: null } },
  { id: 'feifan', name: '非凡资源', api: 'https://api.ffzyapi.com/api.php/provide/vod', browseTypeMap: { 46: 36, 52: null } },
  { id: 'pianku', name: '片库', site: 'https://4k01.pianku.online', browseTypes: [6, 7, 8, 9, 10, 11, 12, 20, 13, 16] },
  { id: 'auete', name: 'Auete', site: 'https://www.aeete.com', search: false, browseTypes: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31] },
  { id: 'zip0', name: 'ZIP0', site: 'https://zip0.com', browseTypes: [] },
  { id: 'dyttzy', name: '电影天堂', api: 'https://caiji.dyttzyapi.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28, 46], browseTypeMap: { 46: 36 } },
  { id: '360zy', name: '360资源', api: 'https://360zyzz.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 46],
    browseTypeMap: { 20: 27, 21: 30, 22: 31, 23: 32, 24: 33, 25: 34, 26: 35, 27: 36, 28: 37, 29: 38, 30: 40, 31: 39 } },
  { id: 'modu', name: '魔都资源', api: 'https://www.mdzyapi.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 25, 26, 27, 28, 46, 52],
    browseTypeMap: { 6: 10, 7: 11, 8: 12, 9: 13, 10: 14, 11: 15, 12: 16, 13: 26, 14: 27, 15: 28, 16: 29, 20: 24, 21: 30, 22: 31, 23: 32, 24: 33, 25: 34, 26: 35, 27: 36, 28: 37, 29: 1, 30: 2, 31: 3, 32: 4, 46: 38, 52: 42 } },
  { id: 'zuid', name: '最大资源', api: 'https://api.zuidapi.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28, 46],
    browseTypeMap: { 14: 17, 16: 14, 21: 18, 22: 16, 24: 19, 26: 27, 27: 26, 32: 44, 33: 45, 46: 54 } },
  { id: 'uku', name: 'U酷资源', api: 'https://api.ukuapi88.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 46], browseTypeMap: { 15: 22, 20: 24, 22: 15, 24: 23, 46: 32 } },
  { id: 'jszy', name: '极速资源', api: 'https://jszyapi.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 6: 9, 7: 11, 8: 10, 9: 12, 10: 13, 11: 14, 12: 15, 13: 20, 14: 4, 15: 5, 16: 3, 20: 16, 21: 28, 22: 6, 24: 7, 25: 30, 26: 32, 27: 31, 28: 33, 29: 24, 30: 25, 31: 26, 52: 54 } },
  { id: 'xinlang', name: '新浪资源', api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 7: 12, 8: 7, 9: 8, 10: 11, 11: 10, 12: 9, 15: 18, 20: 5, 21: 15, 22: 20, 24: 21, 25: 45, 26: 47, 27: 46, 28: 48, 29: 38, 30: 39, 31: 40, 52: 57 } },
  { id: 'jinying', name: '金鹰资源', api: 'https://jinyingzy.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 6: 9, 7: 11, 8: 10, 9: 12, 10: 13, 11: 14, 12: 15, 13: 20, 14: 4, 15: 5, 16: 3, 20: 16, 21: 28, 22: 6, 24: 7, 25: 36, 26: 38, 27: 37, 28: 39, 29: 24, 30: 25, 31: 26, 52: 48 } },
  { id: 'guangsu', name: '光速资源', api: 'https://api.guangsuapi.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 10: 11, 11: 10, 14: 15, 15: 16, 16: 14, 20: 24, 21: 22, 22: 21, 24: 23, 25: 37, 26: 39, 27: 38, 28: 40, 29: 41, 30: 42, 31: 43 } },
  { id: 'ikun', name: 'iKun资源', api: 'https://ikunzyapi.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 46],
    browseTypeMap: { 13: 23, 14: 24, 15: 25, 16: 26, 21: 27, 22: 28, 23: 29, 24: 30, 25: 31, 26: 32, 27: 33, 28: 34, 29: 35, 30: 37, 31: 36, 46: 45 } },
  { id: 'hongniu', name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12, 14: 13, 15: 18, 16: 15, 20: 19, 21: 16, 22: 14, 24: 17, 25: 39, 26: 41, 27: 40, 28: 42, 29: 36, 30: 37, 31: 38, 52: 51 } },
  { id: 'baofeng', name: '暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod/',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28, 46, 52],
    browseTypeMap: { 6: 21, 7: 22, 8: 25, 9: 24, 10: 23, 11: 26, 12: 27, 13: 31, 14: 33, 15: 34, 16: 32, 20: 28, 21: 35, 22: 36, 23: 37, 24: 38, 25: 46, 26: 47, 27: 48, 28: 49, 29: 40, 30: 41, 31: 42, 32: 43, 33: 44, 46: 58, 52: 74 } },
  { id: 'haohua', name: '豪华资源', api: 'https://hhzyapi.com/api.php/provide/vod/',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 6: 9, 7: 11, 8: 10, 9: 12, 10: 13, 11: 14, 12: 15, 13: 20, 14: 4, 15: 5, 16: 3, 20: 16, 21: 28, 22: 6, 24: 7, 25: 30, 26: 32, 27: 31, 28: 33, 29: 24, 30: 25, 31: 26, 52: 53 } },
  { id: 'wujin', name: '无尽资源', api: 'https://api.wujinapi.com/api.php/provide/vod/',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28, 46],
    browseTypeMap: { 15: 22, 20: 21, 21: 15, 22: 23, 23: 24, 24: 37, 26: 27, 27: 26, 32: 42, 33: 43, 46: 41 } },
  { id: 'subo', name: '速播资源', api: 'https://subocaiji.com/api.php/provide/vod/',
    browseTypes: [13, 16, 15, 22, 24, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 7: 12, 8: 7, 9: 8, 10: 11, 11: 10, 12: 9, 13: 14, 15: 16, 16: 17, 20: 5, 21: 15, 22: 20, 24: 21, 25: 33, 26: 35, 27: 34, 28: 36, 29: 24, 30: 25, 31: 26, 46: null, 52: 45 } },
  { id: 'diyi', name: '第一资源', api: 'https://caiji.diyizy.net/api.php/provide/vod/', search: false,
    browseTypes: [13, 16, 15, 22, 24, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28],
    browseTypeMap: { 16: 14, 22: 16, 24: 19, 21: 18, 26: 27, 27: 26, 32: 44, 33: 45, 46: null, 52: null } },
  { id: 'shandian', name: '闪电资源', api: 'https://sdzyapi.com/api.php/provide/vod/', search: false,
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28, 46],
    browseTypeMap: { 16: 14, 14: 17, 21: 18, 22: 16, 24: 19, 26: 27, 27: 26, 32: 44, 33: 45, 46: 54, 52: null } },
  { id: 'suoni', name: '索尼资源', api: 'https://suoniapi.com/api.php/provide/vod/', search: false,
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 32, 33, 25, 26, 27, 28, 46],
    browseTypeMap: { 16: 14, 14: 17, 21: 18, 22: 16, 24: 19, 26: 27, 27: 26, 32: 44, 33: 45, 46: 54, 52: null } },
  { id: 'dazhong', name: '大众资源', api: 'https://cdn.dzzyapi.com/api.php/provide/vod/', browseTypes: [] },
  { id: 'huya', name: '虎牙资源', api: 'https://www.huyaapi.com/api.php/provide/vod/from/hym3u8/at/json',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 25, 26, 27, 28, 52],
    browseTypeMap: { 13: 20, 16: 3, 15: 5, 22: 6, 24: 7, 14: 4, 21: 28, 11: 14, 6: 9, 7: 11, 8: 10, 9: 12, 10: 13, 12: 15, 20: 16, 29: 24, 30: 25, 31: 26, 25: 38, 26: 39, 27: 40, 28: 41, 46: null, 52: 50 } },
  { id: 'maotai', name: '茅台资源', api: 'https://caiji.maotai999.vip/api.php/provide/vod/from/mtm3u8/at/josn/', search: false,
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 29, 30, 31, 33, 26, 27, 28, 46, 52],
    browseTypeMap: { 16: 15, 15: 16, 24: 21, 21: 23, 23: 24, 7: 8, 8: 7, 20: 5, 25: null, 29: 30, 30: 31, 31: 32, 32: null, 46: 37, 52: 56 } },
  { id: 'maoyan', name: '猫眼资源', api: 'https://api.maoyanapi.top/api.php/provide/vod',
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 11, 6, 7, 8, 9, 10, 12, 20, 30, 31, 26, 27],
    browseTypeMap: { 20: 27, 21: 30, 22: 31, 24: 33, 25: null, 26: 36, 27: 35, 29: null, 30: 40, 31: 39, 46: null, 52: null } },
  { id: 'yaya', name: '鸭鸭资源', api: 'https://cj.yayazy.net/api.php/provide/vod/', search: false,
    browseTypes: [13, 16, 15, 22, 24, 14, 21, 23, 11, 6, 7, 8, 9, 10, 12, 20, 30, 31, 32, 33, 27, 28, 46],
    browseTypeMap: { 16: 14, 14: 17, 21: 18, 22: 16, 24: 19, 25: null, 26: null, 27: 26, 29: null, 32: 44, 33: 45, 46: 54, 52: null } },
];

const ZIP_SOURCE_ALIASES = { ruyi: 'ruyi', ffzy: 'feifan', lzi: 'liangzi', lzzy: 'liangzi', zy360: '360zy', jisu: 'jszy', mdzy: 'modu', bfzy: 'baofeng' };

// Manual observations describe the inspected sample, never an entire catalogue.
const CONTENT_OBSERVATIONS = [
  { source: 'subo', id: '161094', title: '初尝玫瑰：上司竟是闺蜜大哥第二季', episode: '', note: '单条视频开头', checkedAt: '2026-10-09' },
  { source: 'diyi', id: '104', title: '凡人修仙传（2020）', episode: '第02集', note: '第02集开头', checkedAt: '2026-10-09' },
  { source: 'kuaiche', id: '132088', title: '雪王来了', episode: '', note: '抽查画面，另有内容错配', checkedAt: '2026-10-09' },
  { source: 'dbzy', id: '152475', title: '婆媳联盟', episode: '第01集', note: '第01集开头', checkedAt: '2026-10-09' },
  { source: 'suoni', id: '35419', title: '斗罗大陆2：绝世唐门2023', episode: '第01集', note: '第01集开头', checkedAt: '2026-10-09' },
  { source: 'dazhong', id: '12267', title: '凡人修仙传', episode: '第01集', note: 'dzyun 线路第01集开头', checkedAt: '2026-10-09' },
  { source: 'huya', id: '9480', title: '凡人修仙传', episode: '第01集', note: '第01集开头', checkedAt: '2026-10-10' },
  { source: 'huya', id: '9480', title: '凡人修仙传', episode: '第02集', note: '第02集开头', checkedAt: '2026-10-10' },
  { source: 'huya', id: '158723', title: '镇国驸马之观棋传第二季', episode: '', note: '单条合集开头及约29分41秒处', checkedAt: '2026-10-10' },
  { source: 'maotai', id: '153014', title: '婆媳联盟', episode: '第01集', note: '第01集开头', checkedAt: '2026-10-10' },
  { source: 'maotai', id: '153014', title: '婆媳联盟', episode: '第02集', note: '第02集开头', checkedAt: '2026-10-10' },
  { source: 'maotai', id: '70360', title: '斗罗大陆2：绝世唐门', episode: '第01集', note: '第01集开头', checkedAt: '2026-10-10' },
  { source: 'maotai', id: '70360', title: '斗罗大陆2：绝世唐门', episode: '第02集', note: '第02集开头', checkedAt: '2026-10-10' },
];

export function contentNotice(item, episodeName = '') {
  const upstream = item?.source === 'zip0' ? String(item.id || '').split(':')[0] : item?.source;
  const source = ZIP_SOURCE_ALIASES[upstream] || upstream;
  const id = item?.source === 'zip0' ? String(item.id || '').split(':')[1] : String(item?.id || '');
  const records = CONTENT_OBSERVATIONS.filter(record => record.source === source);
  const films = records.filter(record => record.id === id);
  const film = films.find(record => episodeName && sameEpisodeName(record.episode, episodeName)) || films[0];
  const single = !film?.episode && item?.lines?.length > 0 && item.lines.every(line => line.episodes?.length === 1 && line.episodes[0].name === episodeName);
  const observed = film && (!episodeName || single || sameEpisodeName(film.episode, episodeName));
  if (observed) return {
    label: '已发现博彩推广', observed: true,
    text: film.note + ' · 人工记录于 ' + film.checkedAt + '。可继续观看或换源；其他片段未逐一检查。',
  };
  if (records.length) return {
    label: '来源有推广记录', observed: false,
    text: (film ? '本片' + film.note : '此来源《' + records[0].title + '》' + records[0].note) + '曾发现博彩推广。' + (episodeName ? '当前视频' : '本片') + '未逐一检查，可继续观看或换源。',
  };
  return { label: '推广情况未核验', observed: false, text: '尚无此来源的人工推广记录，不代表视频没有推广。' };
}

export function validVideoId(source, id) {
  if (!SOURCES.some(item => item.id === source)) return false;
  if (source === 'auete') return /^(?:Movie|Tv|Dm|Zy)\/[A-Za-z0-9_-]{1,30}\/[A-Za-z0-9_-]{1,180}$/.test(String(id));
  if (source === 'zip0') return /^[a-z0-9_-]{1,30}:\d{1,12}$/.test(String(id));
  return /^\d{1,12}$/.test(String(id));
}

export function allowedVideoId(source, id) {
  if (!validVideoId(source, id)) return false;
  if (source !== 'zip0') return true;
  const upstream = String(id).split(':')[0];
  return SOURCES.some(item => item.api && item.id === (ZIP_SOURCE_ALIASES[upstream] || upstream));
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
  let title = String(video.title || '').replace(/\s+/g, '').toLowerCase();
  const year = String(video.year || '');
  // Reviewed aliases only: year suffixes can be part of an unrelated film's title.
  if (year === '2020' && (!video.category || /动漫|动画|国漫/.test(video.category))
    && ['凡人修仙传2020', '凡人修仙传（2020）', '凡人修仙传(2020)'].includes(title)) title = '凡人修仙传';
  return `${title}|${year}`;
}

export function parseRoute(hash) {
  const [path, query = ''] = String(hash || '').replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  if (path === 'detail' || path === 'watch') {
    const source = params.get('source'); const id = params.get('id');
    if (!validVideoId(source, id || '')) return { view: 'home' };
    const episode = Number(params.get('episode'));
    const route = { view: path, source, id, episode: Number.isInteger(episode) && episode > 0 && episode <= 10000 ? episode - 1 : null };
    const name = plainText(params.get('name'));
    if (path === 'watch' && name && name.length <= 120) route.episodeName = name;
    return route;
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
  const canonicalKey = value => {
    const divider = value.lastIndexOf('|');
    return videoKey({ title: value.slice(0, divider), year: value.slice(divider + 1) });
  };
  const cleanTop = value => Number.isFinite(value) && value >= 0 && value <= 1000000 ? value : 0;
  const cleanAnchor = (anchor, controls) => validKey(anchor?.key) && Number.isFinite(anchor.offset) && Math.abs(anchor.offset) <= 10000
    ? { key: canonicalKey(anchor.key), offset: anchor.offset, focus: controls.includes(anchor.focus) ? anchor.focus : '' } : null;
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
      top: cleanTop(value.top), hero: validKey(value.hero) ? canonicalKey(value.hero) : '',
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
    const complete = item.isComplete === true || /已完结|全\d+|\d+集全|完结|全集|全剧集|HD|高清|正片|蓝光/i.test(item.remarks || '');
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
  if (!allowedVideoId(source, id) || !title || /伦理|色情|福利|写真|里番|成人|解说|预告/.test(category + title)) return null;
  const upstream = id.split(':')[0];
  const origin = source === 'zip0' ? ZIP_SOURCE_ALIASES[upstream] || upstream : source;
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

export function sameEpisodeName(first, second) {
  const left = plainText(first); const right = plainText(second);
  return Boolean(left && right) && (left === right || episodeNumber(left) !== null && episodeNumber(left) === episodeNumber(right));
}

export function nextEpisode(index, length) {
  return Number.isInteger(index) && index >= 0 && index + 1 < length ? index + 1 : -1;
}

function queryServiceError(message) {
  const error = new Error(message); error.name = 'QueryServiceError'; return error;
}

async function fetchQuery(url, signal, fetchImpl, timeout = 15000) {
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
  try { return await fetchImpl(url, { signal: requestSignal }); }
  catch (error) {
    if (signal?.aborted) throw error;
    if (requestSignal.aborted || error?.name === 'TimeoutError') throw queryServiceError('查询服务响应超时，请重试');
    throw queryServiceError('暂时无法连接查询服务，请检查网络后重试');
  }
}

export async function requestVideos(source, { query = '', id = '', page = 1, mode = '', category = 'tv', type, base = '', signal, fetchImpl = fetch } = {}) {
  if (!SOURCES.some(item => item.id === source)) throw new Error('未知的影片来源');
  const params = new URLSearchParams({ source, page: String(page) });
  if (id) params.set('id', id);
  else if (mode === 'browse') {
    params.set('mode', 'browse'); params.set('category', category);
    if (type !== undefined) params.set('type', String(type));
  } else params.set('q', query);
  const response = await fetchQuery(`${base.replace(/\/$/, '')}/api/vod?${params}`, signal, fetchImpl);
  let data;
  try { data = await response.json(); } catch { throw queryServiceError('查询服务没有返回有效数据，请重试'); }
  if (!response.ok) {
    if (response.status !== 502) throw queryServiceError('查询服务暂时无法完成请求，请稍后重试');
    throw new Error(typeof data?.error === 'string' ? data.error : '暂时无法连接这个来源');
  }
  if (!Array.isArray(data?.list)) throw queryServiceError('查询服务没有返回有效目录，请重试');
  return { videos: normalizeResponse(data, source), pages: Math.min(20, Math.max(1, Number(data.pagecount) || 1)), limited: Number(data.pagecount) > 20, ...(response.headers.get('X-Video-Fallback') ? { degraded: response.headers.get('X-Video-Fallback'), cachedAt: Number(response.headers.get('X-Video-Cached-At')) || 0 } : {}) };
}

export async function requestEpisode(source, id, ref, name, { base = '', signal, fetchImpl = fetch } = {}) {
  const label = plainText(name);
  if (!validVideoId(source, id) || !['auete', 'pianku'].includes(source) || !/^\d{1,4}-\d{1,4}$/.test(ref || '') || !label || label.length > 120) throw new Error('剧集参数不正确');
  const params = new URLSearchParams({ source, id, ref, name: label });
  const response = await fetchQuery(`${base.replace(/\/$/, '')}/api/play?${params}`, signal, fetchImpl, 25000);
  let data;
  try { data = await response.json(); } catch { throw queryServiceError('查询服务没有返回有效数据，请重试'); }
  const url = safeURL(data?.url);
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
  const index = items => {
    const saved = new Map();
    for (const item of items.slice(0, 100)) {
      if (!item || typeof item.title !== 'string' || typeof item.uid !== 'string' || !validVideoId(item.source, item.id)) continue;
      const key = videoKey(item);
      // Saved lists put the latest record first; aliases must not restore older progress.
      if (!saved.has(key)) saved.set(key, item);
    }
    return saved;
  };
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
