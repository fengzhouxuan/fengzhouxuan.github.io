import { plainText, safeURL, validVideoId, videoKey } from './core.js';

// Cloud records contain display metadata only, never playback addresses or history.
export function cleanFavorites(items) {
  if (!Array.isArray(items) || items.length > 100) throw new Error('收藏列表最多保存100部影片');
  const saved = new Map();
  for (const item of items) {
    if (!item || !validVideoId(item.source, item.id) || item.uid !== item.source + ':' + item.id || !plainText(item.title)) throw new Error('收藏影片信息不正确');
    const value = { uid: item.uid, source: item.source, id: String(item.id), poster: safeURL(item.poster).slice(0, 2048), isComplete: item.isComplete === true };
    for (const key of ['title', 'year', 'area', 'category', 'remarks', 'updateSchedule', 'updatedAt']) value[key] = plainText(item[key]).slice(0, 500);
    if (['episodes', 'single', 'compilation'].includes(item.playbackKind)) value.playbackKind = item.playbackKind;
    const tracking = item.tracking;
    if (tracking && Number.isFinite(tracking.checkedAt) && tracking.checkedAt > 0) {
      const bounded = number => Number.isInteger(number) && number >= 0 && number <= 10000 ? number : 0;
      value.tracking = { latest: bounded(tracking.latest) || null, acknowledged: bounded(tracking.acknowledged), count: bounded(tracking.count), checkedAt: tracking.checkedAt };
    }
    const key = videoKey(value);
    if (!saved.has(key)) saved.set(key, value);
  }
  return [...saved.values()];
}

export function favoriteStorageKey(user = null) {
  return user && /^\d{1,20}$/.test(String(user.id)) ? 'video-favorites:' + user.id : 'video-favorites';
}
