import { createLibraryAccountClient } from './account-client.js';
import { cleanMusicLibrary, mergeMusicLibraries, musicLibraryStorageKey, EMPTY_MUSIC_LIBRARY } from './music-library.js';

export function createMusicAccountClient(options = {}) {
  return createLibraryAccountClient({
    ...options,
    onData: options.onLibrary,
    library: {
      namespace: 'music', label: '音乐库', endpoint: 'music', empty: EMPTY_MUSIC_LIBRARY, loginKey: 'music-account-login-v1',
      storageKey: musicLibraryStorageKey, clean: data => cleanMusicLibrary(data, false), merge: mergeMusicLibraries,
      read(storage, user) {
        const value = JSON.parse(storage?.getItem(musicLibraryStorageKey(user)) || 'null');
        if (!value) return EMPTY_MUSIC_LIBRARY;
        // Match the existing player migration, which no longer supports Migu.
        const supported = tracks => Array.isArray(tracks) ? tracks.filter(track => track?.source !== 'migu') : tracks;
        return { favorites: supported(value.favorites), playlists: value.playlists?.map(list => ({ ...list, tracks: supported(list.tracks) })) };
      },
      count: items => items.favorites.length + items.playlists.length,
      defaultRoute: '#library', isRoute: route => /^#[a-z][a-z0-9-]*(?:\?|$)/i.test(route) && !route.startsWith('#account'),
      importLocal: (local, current) => mergeMusicLibraries(EMPTY_MUSIC_LIBRARY, local, current),
    },
  });
}
