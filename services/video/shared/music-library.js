import { mergeRecords } from './sync-data.js';

export const MUSIC_LIBRARY_KEY = 'pikachu-music-library-v1';
export const EMPTY_MUSIC_LIBRARY = { favorites: [], playlists: [] };
const sources = ['netease', 'qq', 'kuwo', 'joox'];
const text = (value, max = 200) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const safeURL = value => {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href.slice(0, 1024) : ''; } catch { return ''; }
};

function cleanTrack(raw) {
  if (!raw || !sources.includes(raw.source) || typeof raw.uid !== 'string' || !raw.uid.startsWith(raw.source + '-') || raw.uid.length > 256 || raw.uid.length <= raw.source.length + 1 || /[\u0000-\u001f\u007f]/.test(raw.uid)) throw new Error('歌曲标识不正确，本机歌单仍保留。');
  const track = { uid: raw.uid, source: raw.source, title: text(raw.title) || '未知歌曲', artist: text(Array.isArray(raw.artist) ? raw.artist.join(' / ') : raw.artist), album: text(raw.album) };
  for (const name of ['keyword', 'songid', 'songMid', 'qqId', 'qqSearchKey', 'jooxSongId', 'jooxSongMid', 'quality', 'qualityLabel', 'qqQualityText', 'jooxQualityText', 'pay']) {
    if (raw[name] !== undefined && raw[name] !== null && raw[name] !== '') track[name] = text(raw[name]);
  }
  for (const name of ['displayIndex', 'qqIndex', 'jooxIndex']) if (Number.isSafeInteger(raw[name]) && raw[name] >= 0 && raw[name] <= 10000) track[name] = raw[name];
  for (const name of ['cover', 'pageUrl']) { const url = safeURL(raw[name]); if (url) track[name] = url; }
  if (raw.featured === true) track.featured = true;
  return track;
}

function cleanTracks(items, enforceLimits) {
  if (!Array.isArray(items) || enforceLimits && items.length > 1000) throw new Error('每份收藏或歌单最多保存1000首歌曲。');
  const tracks = new Map();
  for (const raw of items) { const track = cleanTrack(raw); if (!tracks.has(track.uid)) tracks.set(track.uid, track); }
  return [...tracks.values()];
}

export function cleanMusicLibrary(data, enforceLimits = true) {
  if (!data || !Array.isArray(data.favorites) || !Array.isArray(data.playlists) || enforceLimits && data.playlists.length > 100) throw new Error('歌单格式不正确，最多保存100个歌单。');
  const favorites = cleanTracks(data.favorites, enforceLimits); const playlists = []; const ids = new Set();
  for (const raw of data.playlists) {
    if (!raw || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(raw.id) || ids.has(raw.id)) throw new Error('歌单标识不正确或重复。');
    ids.add(raw.id); playlists.push({ id: raw.id, name: text(raw.name, 100).trim() || '未命名歌单', tracks: cleanTracks(raw.tracks, enforceLimits) });
  }
  const value = { favorites, playlists };
  if (enforceLimits && new TextEncoder().encode(JSON.stringify(value)).length > 1000000) throw new Error('歌单数据超过1MB，请先整理歌单；本机数据仍保留。');
  return value;
}

export function musicLibraryStorageKey(user = null) {
  return user && /^\d{1,20}$/.test(String(user.id)) ? MUSIC_LIBRARY_KEY + ':' + user.id : MUSIC_LIBRARY_KEY;
}

export function mergeMusicLibraries(previous, local, remote) {
  const before = cleanMusicLibrary(previous, false); const next = cleanMusicLibrary(local, false); const latest = cleanMusicLibrary(remote, false);
  const tracks = (a, b, c) => mergeRecords(a, b, c, item => item.uid);
  return cleanMusicLibrary({
    favorites: tracks(before.favorites, next.favorites, latest.favorites),
    playlists: mergeRecords(before.playlists, next.playlists, latest.playlists, item => item.id, (original, a, b) => ({
      id: a.id, name: !original || a.name !== original.name ? a.name : b.name,
      tracks: tracks(original?.tracks || [], a.tracks, b.tracks),
    })),
  }, false);
}
