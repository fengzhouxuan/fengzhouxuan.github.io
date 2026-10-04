import test from 'node:test';
import assert from 'node:assert/strict';
import { attachMusicAccount } from '../../source/music/account-ui.js';
import { ACCOUNT_SESSION_KEY } from '../../source/music/shared/account-client.js';
import { MUSIC_LIBRARY_KEY } from '../../source/music/shared/music-library.js';

const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test('music account controls handle login, import, automatic sync, shared logout and accessible dismissal', async () => {
  const storage = memory(); const tabStorage = memory(); const events = new Map(); const nodes = new Map(); const notifications = []; const libraries = []; const libraryScopes = [];
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', hidden: false, disabled: false, open: false, classList: { toggle() {} }, addEventListener: (name, fn) => events.set(id + ':' + name, fn), contains: target => [...nodes.values()].includes(target), focus() { this.focused = true; } });
    return nodes.get(id);
  };
  const names = ['window', 'document', 'location', 'history', 'fetch']; const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let language = 'zh'; let client; let remote = { favorites: [], playlists: [] }; let version = 0; let offline = false;
  let loginRequests = 0; let failLogin = true; let completeLogin; let notifyLogin;
  const loginRequested = new Promise(resolve => { notifyLogin = resolve; });
  const user = { id: '12', login: 'tester', avatar: '' }; const token = 't'.repeat(43);
  storage.setItem(MUSIC_LIBRARY_KEY, JSON.stringify({ favorites: [{ uid: 'netease-12', source: 'netease', songid: '12', title: '本机歌曲' }], playlists: [] }));
  globalThis.window = { localStorage: storage, sessionStorage: tabStorage, addEventListener: (name, fn) => events.set('window:' + name, fn) };
  globalThis.document = { hidden: false, getElementById: element, addEventListener: (name, fn) => events.set('document:' + name, fn) };
  globalThis.location = { origin: 'https://site.example', pathname: '/music/', search: '', hash: '', assign(value) { this.target = value; } };
  globalThis.history = { replaceState(_state, _title, value) { this.url = value; } };
  globalThis.fetch = async (url, init = {}) => {
    if (offline) throw new TypeError('offline');
    if (url.endsWith('/config')) return Response.json({ enabled: true });
    if (url.endsWith('/login')) {
      loginRequests++;
      if (failLogin) throw new TypeError('Login unavailable');
      const waiting = new Promise(resolve => { completeLogin = resolve; });
      notifyLogin(); await waiting;
      return Response.json({ url: 'https://github.com/login/oauth/authorize' });
    }
    if (url.endsWith('/exchange')) return Response.json({ user, token, expiresAt: Date.now() + 86400000 });
    if (url.endsWith('/logout')) return Response.json({ ok: true });
    if (init.method === 'PUT') { const data = JSON.parse(init.body); assert.equal(data.version, version); remote = data.items; version++; }
    return Response.json({ user, items: remote, version });
  };
  try {
    client = attachMusicAccount({ applyLibrary: (value, options) => { libraries.push(value); libraryScopes.push(options?.scopeChanged === true); }, showToast: value => notifications.push(value), getLanguage: () => language });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(client.state.enabled, true); assert.equal(libraries[0].favorites[0].title, '本机歌曲');
    assert.equal(libraryScopes[0], true);
    language = 'en'; client.render(); assert.equal(element('music-account-label').textContent, 'Sign in'); language = 'zh'; client.render();
    await events.get('music-account-login:click')();
    assert.equal(element('music-account-login').disabled, false, 'A failed login can be retried.');
    assert.equal(notifications.at(-1), 'Login unavailable');
    failLogin = false;
    const firstLogin = events.get('music-account-login:click')();
    const repeatedLogin = events.get('music-account-login:click')();
    await loginRequested;
    assert.equal(element('music-account-login').disabled, true, 'Shared-client changes must preserve the login button lock.');
    client.render(); assert.equal(element('music-account-login').disabled, true);
    assert.equal(loginRequests, 2, 'The retry sends one login request despite repeated clicks.');
    completeLogin(); await Promise.all([firstLogin, repeatedLogin]);
    assert.equal(location.target, 'https://github.com/login/oauth/authorize');
    await client.initialize('#account?ticket=' + 'a'.repeat(43));
    assert.equal(history.url, '/music/#library'); assert.equal(element('music-account-panel').open, true); assert.equal(element('music-account-label').textContent, 'tester');
    assert.equal(libraryScopes.filter(Boolean).length, 2);
    assert.equal(libraryScopes.at(-1), false);
    storage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify({ user, token: 'r'.repeat(43), expiresAt: Date.now() + 86400000 }));
    events.get('window:storage')({ storageArea: storage, key: ACCOUNT_SESSION_KEY });
    await client.sync();
    assert.equal(libraryScopes.filter(Boolean).length, 2, 'Renewing the same account session preserves its playback queue.');
    events.get('music-account-import:click')(); await client.sync(); assert.equal(remote.favorites.length, 1); assert.equal(notifications.length, 2);
    assert.equal(JSON.parse(storage.getItem(MUSIC_LIBRARY_KEY)).favorites.length, 1);
    offline = true; client.changed({ favorites: [], playlists: [] }); await client.sync(); assert.match(element('music-account-status').textContent, /音乐库.*本机/);
    offline = false; await events.get('music-account-sync:click')();
    element('music-account-panel').open = true; events.get('document:keydown')({ key: 'Escape' }); assert.equal(element('music-account-panel').open, false); assert.equal(element('music-account-summary').focused, true);
    element('music-account-panel').open = true; events.get('document:click')({ target: {} }); assert.equal(element('music-account-panel').open, false);
    storage.removeItem(ACCOUNT_SESSION_KEY); events.get('window:storage')({ storageArea: storage, key: ACCOUNT_SESSION_KEY }); assert.equal(client.state.user, null); assert.equal(client.state.items.favorites.length, 1);
    assert.equal(libraryScopes.at(-1), true);
    events.get('window:storage')({ storageArea: {}, key: null }); events.get('document:visibilitychange')(); await events.get('window:online')();
    events.get('music-account-logout:click')(); assert.equal(storage.getItem(ACCOUNT_SESSION_KEY), null);
  } finally {
    client?.logout();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});
