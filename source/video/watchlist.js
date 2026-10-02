import { plainText, safeURL, validVideoId, videoKey, releaseSchedule, episodeNumber } from './core.js';
import { playbackSummary } from './playback.js';

const seriesCategory = category => /动漫|动画|国漫|日漫|剧/.test(category || '') && !/电影|片$/.test(category || '');

function trackingFor(item) {
  const value = item.tracking;
  if (!value || !Number.isFinite(value.checkedAt) || value.checkedAt <= 0) return null;
  const latest = Number.isInteger(value.latest) && value.latest > 0 && value.latest < 10000 ? value.latest : null;
  const acknowledged = Number.isInteger(value.acknowledged) && value.acknowledged >= 0 && value.acknowledged < 10000 ? value.acknowledged : latest || 0;
  return { latest, acknowledged, count: Number.isInteger(value.count) && value.count >= 0 && value.count <= 10000 ? value.count : 0, checkedAt: value.checkedAt };
}

export function sameFavorite(saved, item) {
  return saved.uid === item.uid && videoKey({ ...saved, year: '' }) === videoKey({ ...item, year: '' }) && (!saved.year || !item.year || saved.year === item.year);
}

export function snapshotFavorite(item, previous = null, now = Date.now()) {
  const { uid, id, source } = item;
  if (!validVideoId(source, id) || uid !== source + ':' + id || !plainText(item.title) || !Number.isFinite(now) || now <= 0) throw new Error('收藏影片信息不正确');
  const known = previous && sameFavorite(previous, item) ? previous : null;
  const saved = { uid, id, source, poster: safeURL(item.poster) || safeURL(known?.poster), isComplete: Boolean(item.isComplete) };
  for (const key of ['title', 'year', 'area', 'category', 'remarks', 'updateSchedule', 'updatedAt']) saved[key] = plainText(item[key]).slice(0, 500);
  for (const key of ['year', 'area', 'category']) if (!saved[key]) saved[key] = plainText(known?.[key]).slice(0, 500);
  if (Array.isArray(item.lines)) {
    const episodes = item.lines[0]?.episodes || [];
    const summary = playbackSummary({ ...item, category: saved.category });
    saved.playbackKind = summary.kind;
    const numbers = seriesCategory(saved.category) && summary.kind === 'episodes' ? episodes.map(episode => episodeNumber(episode.name)).filter(Boolean) : [];
    const latest = numbers.length ? numbers.reduce((max, number) => Math.max(max, number), 0) : null;
    const old = known ? trackingFor(known) : null;
    saved.tracking = { latest, acknowledged: old?.acknowledged || latest || 0, count: Math.min(10000, episodes.length), checkedAt: now };
  }
  return saved;
}

export function favoriteSummary(item, history = [], overrides = []) {
  const tracking = trackingFor(item);
  const progress = history.filter(record => videoKey(record) === videoKey(item)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const watched = progress ? episodeNumber(progress.episode) : null;
  const hasNew = Boolean(tracking?.latest && tracking.latest > tracking.acknowledged && (!watched || watched < tracking.latest));
  const unwatched = Boolean(tracking?.latest && watched && watched < tracking.latest);
  const single = tracking?.count === 1 && ['single', 'compilation'].includes(item.playbackKind);
  let availability = tracking?.latest ? '可看至第 ' + tracking.latest + ' 集' : tracking?.count ? tracking.count + ' 个播放条目' : plainText(item.remarks) || '尚未取得播放集数';
  let comparisonNote = tracking?.count && !tracking.latest && seriesCategory(item.category) ? '集数名称不规则，需手动确认新集' : '';
  if (single) {
    availability = item.playbackKind === 'compilation' ? '整部合集' : /电影|片$/.test(item.category || '') ? '单部影片' : '单条视频';
    comparisonNote = item.playbackKind === 'single' && /短剧|漫剧/.test(item.category || '') ? '来源未说明是否为整部合集' : '';
  }
  return { hasNew, unwatched, availability, comparisonNote, checkedAt: tracking?.checkedAt || 0, progress, schedule: releaseSchedule(item, overrides) };
}

export function acknowledgeFavorite(item, history = null) {
  const tracking = trackingFor(item);
  if (history && (!tracking?.latest || (episodeNumber(favoriteSummary(item, history).progress?.episode) || 0) < tracking.latest || tracking.acknowledged >= tracking.latest)) return item;
  return tracking ? { ...item, tracking: { ...tracking, acknowledged: tracking.latest } } : item;
}

export function createWatchlistRefresher({ request, onUpdate = () => {}, onChange = () => {}, concurrency = 3 } = {}) {
  if (typeof request !== 'function' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new Error('片单查询配置不正确');
  const state = { loading: false, completed: 0, total: 0, failed: [], stopped: false };
  let version = 0; let controller;

  function stop() {
    version++; controller?.abort(); state.loading = false; state.stopped = true; onChange();
  }

  async function refresh(items = []) {
    if (state.loading) return;
    const queue = [...new Map(items.slice(0, 100).map(item => [item.uid, item])).values()];
    const current = ++version; controller = new AbortController();
    Object.assign(state, { loading: Boolean(queue.length), completed: 0, total: queue.length, failed: [], stopped: false }); onChange();
    let next = 0;
    async function worker() {
      while (current === version && next < queue.length) {
        const saved = queue[next++];
        try {
          const result = await request(saved.source, { id: saved.id, signal: controller.signal });
          if (current !== version) return;
          const item = result.videos.find(value => sameFavorite(saved, value));
          if (!item) throw new Error('来源未返回同一部影片');
          onUpdate(item);
        } catch {
          if (current !== version) return;
          state.failed.push({ uid: saved.uid, title: plainText(saved.title) });
        }
        state.completed++; onChange();
      }
    }
    try { await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker)); }
    finally { if (current === version) { state.loading = false; onChange(); } }
  }

  return { state, refresh, stop };
}
