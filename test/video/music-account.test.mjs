import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicAccountClient } from '../../source/video/shared/music-account.js';
import { ACCOUNT_SESSION_KEY } from '../../source/video/shared/account-client.js';
import { cleanMusicLibrary, musicLibraryStorageKey, EMPTY_MUSIC_LIBRARY as empty } from '../../source/video/shared/music-library.js';
import { createAccountClient } from '../../source/video/account.js';

const user = { id: '12', login: 'tester', avatar: '' };
const token = 't'.repeat(43);
const song = id => ({ uid: 'netease-' + id, source: 'netease', songid: String(id), title: '歌曲' + id });
const collection = (favorites = [], tracks = [], name = '歌单') => cleanMusicLibrary({ favorites, playlists: [{ id: 'pl-one', name, tracks }] });
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(t, initial = empty) {
  const records = new Map([['12/music', { items: copy(initial), version: 0 }]]);
  let offline = false; let hook; const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init }); const path = new URL(url).pathname.split('/').pop();
    if (hook) { const value = await hook(url, init); if (value) return value; }
    if (offline) throw new TypeError('offline');
    if (path === 'config') return Response.json({ enabled: true });
    if (path === 'logout') return Response.json({ ok: true });
    if (path === 'login') return Response.json({ url: 'https://github.com/login/oauth/authorize' });
    if (path === 'exchange') return Response.json({ user, token, expiresAt: 1e12 });
    const owner = init.headers?.Authorization?.includes('o'.repeat(43)) ? { id: '13', login: 'other' } : user;
    const key = owner.id + '/' + path; const value = records.get(key) || { items: path === 'music' ? copy(empty) : [], version: 0 };
    if (init.method === 'PUT') {
      const payload = JSON.parse(init.body);
      if (path === 'music') {
        try { cleanMusicLibrary(payload.items); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      }
      if (payload.version !== value.version) return Response.json({ user: owner, ...value }, { status: 409 });
      value.items = copy(payload.items); value.version++; records.set(key, value);
    }
    return Response.json({ user: owner, ...value });
  };
  function client({ storage = memory(), guest = false, video = false, tabStorage = memory(), ...options } = {}) {
    if (!guest && !storage.getItem(ACCOUNT_SESSION_KEY)) storage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify({ user, token, expiresAt: 1e12 }));
    const account = (video ? createAccountClient : createMusicAccountClient)({ base: 'https://api.example', storage, tabStorage, fetchImpl, now: () => 1000000, ...options });
    t.after(() => account.logout());
    return { account, storage, tabStorage };
  }
  return { client, records, calls, offline: value => { offline = value; }, intercept: value => { hook = value; } };
}

test('music reuses an existing video session, isolates guest data and imports local songs and playlists explicitly', async t => {
  const f = fixture(t, collection([song(1)], [song(1)])); const shared = memory();
  shared.setItem(musicLibraryStorageKey(), JSON.stringify(collection([song(2)], [song(2)])));
  const video = f.client({ storage: shared, video: true }); const music = f.client({ storage: shared });
  await video.account.initialize(); await music.account.initialize();
  assert.equal(music.account.state.user.id, video.account.state.user.id); assert.equal(f.calls.some(call => call.url.endsWith('/login')), false);
  assert.deepEqual(music.account.state.items.favorites.map(item => item.songid), ['1']);
  assert.equal(music.account.localCount(), 2); music.account.importLocal(); await music.account.sync();
  assert.deepEqual(new Set(music.account.state.items.playlists[0].tracks.map(item => item.songid)), new Set(['1', '2']));
  assert.deepEqual(f.records.get('12/favorites'), undefined);
  music.account.logout(); assert.equal(video.account.refreshSession(), true); assert.equal(video.account.state.user, null);
  assert.equal(music.account.state.items.favorites[0].songid, '2');
});

test('two devices merge offline favorites, nested song deletions, additions and remote playlist renames', async t => {
  const f = fixture(t, collection([song(1)], [song(1), song(2)]));
  const a = f.client(); const b = f.client(); await a.account.initialize(); await b.account.initialize();
  f.offline(true); a.account.changed(collection([song(1), song(3)], [song(2), song(3)]));
  assert.equal(await a.account.sync(), false); assert.equal(a.account.state.pending, true); assert.equal(a.account.state.phase, 'offline');
  f.offline(false); b.account.changed(collection([song(4)], [song(1), song(2), song(4)], '远端名称')); await b.account.sync();
  await a.account.sync(); await b.account.sync();
  assert.deepEqual(a.account.state.items, b.account.state.items);
  assert.deepEqual(new Set(a.account.state.items.favorites.map(item => item.songid)), new Set(['3', '4']));
  assert.deepEqual(new Set(a.account.state.items.playlists[0].tracks.map(item => item.songid)), new Set(['2', '3', '4']));
  assert.equal(a.account.state.items.playlists[0].name, '远端名称'); assert.equal(a.account.state.pending, false);
  const reloaded = f.client({ storage: a.storage }); await reloaded.account.initialize(); assert.deepEqual(reloaded.account.state.items, a.account.state.items);
});

test('a conflicting cloud revision and changes during upload preserve nested playlist order and new edits', async t => {
  const f = fixture(t, collection([], [song(1), song(2)])); const a = f.client(); await a.account.initialize();
  a.account.changed(collection([], [song(2), song(1), song(3)]));
  let release; let once = true;
  f.intercept(async (_url, init) => init.method === 'PUT' && once ? (once = false, new Promise(resolve => { release = resolve; })) : null);
  const syncing = a.account.sync(); while (!release) await new Promise(resolve => setImmediate(resolve));
  const remote = f.records.get('12/music'); remote.items = collection([], [song(1), song(2), song(4)]); remote.version++;
  a.account.changed(collection([song(5)], [song(2), song(1), song(3), song(5)]));
  release(Response.json({ user, ...remote }, { status: 409 })); await syncing;
  assert.deepEqual(a.account.state.items.playlists[0].tracks.map(item => item.songid), ['2', '1', '3', '5', '4']);
  assert.equal(a.account.state.items.favorites[0].songid, '5'); assert.equal(a.account.state.pending, false);
});

test('shared logout and cross-tab switching cancel stale responses and preserve each account library', async t => {
  const f = fixture(t, collection([song(1)])); const a = f.client(); await a.account.initialize();
  let release; f.intercept(async url => url.endsWith('/music') ? new Promise(resolve => { release = resolve; }) : null);
  const pending = a.account.sync(); while (!release) await new Promise(resolve => setImmediate(resolve));
  const other = { id: '13', login: 'other' };
  a.storage.setItem(musicLibraryStorageKey(other), JSON.stringify(collection([song(9)])));
  a.storage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify({ user: other, token: 'o'.repeat(43), expiresAt: 1e12 }));
  assert.equal(a.account.refreshSession(), true); release(Response.json({ user, items: collection([song(1)]), version: 0 })); assert.equal(await pending, false);
  assert.equal(a.account.state.user.id, '13'); assert.equal(a.account.state.items.favorites[0].songid, '9');
  assert.equal(a.account.refreshLocal(), false); a.storage.setItem(musicLibraryStorageKey(other), JSON.stringify(collection([song(10)])));
  assert.equal(a.account.refreshLocal(), true); assert.equal(a.account.state.items.favorites[0].songid, '10');
});

test('music OAuth callbacks restore the music route and the shared session without accessing video-specific data', async t => {
  const f = fixture(t); const a = f.client({ guest: true }); let route;
  const music = f.client({ guest: true, storage: a.storage, tabStorage: a.tabStorage, onCallback: value => { route = value; } });
  await music.account.login('https://site.example/music/', '#song-search');
  await music.account.initialize('#account?ticket=' + 'a'.repeat(43));
  assert.equal(route, '#song-search'); assert.equal(music.account.state.user.id, '12');
  assert.ok(music.storage.getItem(ACCOUNT_SESSION_KEY)); assert.equal(music.tabStorage.getItem('music-account-login-v1'), null);
  assert.equal(f.calls.some(call => call.url.endsWith('/favorites')), false);
});

test('large legacy libraries stay usable locally and show cloud limits without losing pending songs', async t => {
  const f = fixture(t); const storage = memory();
  const large = { favorites: Array.from({ length: 1001 }, (_, id) => song(id)), playlists: [] };
  storage.setItem(musicLibraryStorageKey(user), JSON.stringify(large));
  const a = f.client({ storage }); await a.account.initialize();
  assert.equal(a.account.state.items.favorites.length, 1001); assert.equal(a.account.state.phase, 'error');
  assert.equal(a.account.state.pending, true); assert.match(a.account.state.message, /1000/);
  assert.equal(JSON.parse(storage.getItem(musicLibraryStorageKey(user))).favorites.length, 1001);
  a.account.changed({ favorites: large.favorites.slice(0, 999), playlists: [] }); await a.account.sync();
  assert.equal(a.account.state.pending, false); assert.equal(a.account.state.phase, 'idle');
  const guest = memory(); guest.setItem(musicLibraryStorageKey(), JSON.stringify({ favorites: [song(1), { source: 'migu', uid: 'migu-1' }], playlists: [] }));
  const migrated = f.client({ storage: guest, guest: true }); assert.equal(migrated.account.state.items.favorites.length, 1);
  assert.equal(JSON.parse(guest.getItem(musicLibraryStorageKey())).favorites.length, 2);
});
