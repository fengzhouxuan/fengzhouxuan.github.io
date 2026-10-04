import { createLibraryAccountClient } from './shared/account-client.js';
import { loadSaved, mergeSavedItems } from './core.js';
import { cleanFavorites, favoriteStorageKey } from './favorites.js';

export function createAccountClient(options = {}) {
  return createLibraryAccountClient({
    ...options,
    onData: options.onFavorites,
    library: {
      namespace: 'video', endpoint: 'favorites', empty: [], loginKey: 'video-account-login-v1',
      storageKey: favoriteStorageKey, clean: cleanFavorites, merge: mergeSavedItems,
      read: (storage, user) => loadSaved(storage, favoriteStorageKey(user)),
      count: items => items.length,
      defaultRoute: '#library', isRoute: route => /^#(?:home|browse|search|library|detail|watch)(?:\?|$)/.test(route),
      importLocal(local, current) {
        if (new Set([...local, ...current].map(item => item.title.replace(/\s+/g, '').toLowerCase() + '|' + item.year)).size > 100) throw new Error('合并后超过100部，请先整理收藏；本机原收藏仍然保留。');
        return mergeSavedItems([], local, current);
      },
    },
  });
}
