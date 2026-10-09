import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient } from '../../source/video/account.js';
import { cleanFavorites, favoriteStorageKey } from '../../source/video/favorites.js';

const base = 'https://api.example';
const user = { id: '12', login: 'tester', avatar: '' };
const token = 't'.repeat(43);
const film = (id = '12') => cleanFavorites([{ uid: 'liangzi:' + id, source: 'liangzi', id, title: '影片' + id }])[0];
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

function fixture(t, options = {}) {
  const storage = options.storage || memory(); const tabStorage = options.tabStorage || memory();
  if (options.loggedIn !== false) storage.setItem('video-account-session-v1', JSON.stringify({ user, token, expiresAt: 1e12 }));
  let remote = options.remote || []; let version = 0; const calls = []; const scopes = []; const snapshots = []; const callbacks = [];
  const client = createAccountClient({ base, storage, tabStorage, now: options.now || (() => 1000000), onScope: state => scopes.push(state.user?.id || 'guest'), onFavorites: items => snapshots.push(items), onCallback: hash => callbacks.push(hash), fetchImpl: async (url, init = {}) => {
    calls.push({ url, init }); const path = new URL(url).pathname;
    if (options.fetchImpl) { const response = await options.fetchImpl(url, init); if (response) return response; }
    if (path.endsWith('/config')) return Response.json({ enabled: true });
    if (path.endsWith('/login')) return Response.json({ url: 'https://github.com/login/oauth/authorize?client_id=test' });
    if (path.endsWith('/exchange')) return Response.json({ user, token, expiresAt: 1e12 });
    if (init.method === 'PUT') { const data = JSON.parse(init.body); assert.equal(data.version, version); remote = data.items; version++; }
    return Response.json({ user, items: remote, version });
  } });
  t.after(() => client.logout());
  return { client, storage, tabStorage, calls, scopes, snapshots, callbacks, remote: () => remote };
}

test('first account sync keeps guest favorites separate and imports them only after an explicit action', async t => {
  const f = fixture(t, { remote: [film('13')] }); f.storage.setItem('video-favorites', JSON.stringify([film()]));
  await f.client.initialize(); assert.deepEqual(f.client.state.items, [film('13')]); assert.equal(f.client.localCount(), 1); assert.equal(f.client.state.pending, false);
  assert.equal(f.client.importLocal(), true); assert.equal(f.client.state.items.length, 2); await f.client.sync(); assert.equal(f.remote().length, 2);
  assert.deepEqual(JSON.parse(f.storage.getItem('video-favorites')), [film()]);
  f.client.logout(); assert.equal(f.client.state.user, null); assert.deepEqual(f.client.state.items, [film()]);
  assert.equal(f.client.importLocal(), false);
});

test('local alias counts and account imports use the same reviewed identity at the collection limit', async t => {
  const alias = { ...film(), title: '凡人修仙传2020', year: '2020', category: '国漫' };
  const canonical = { ...film('13'), title: '凡人修仙传', year: '2020', category: '国产动漫' };
  const f = fixture(t, { remote: [canonical] });
  f.storage.setItem('video-favorites', JSON.stringify([alias, canonical]));
  assert.equal(f.client.localCount(), 1);
  const unique = Array.from({ length: 99 }, (_value, index) => film(String(100 + index)));
  f.storage.setItem('video-favorites', JSON.stringify([alias, ...unique]));
  await f.client.initialize(); assert.equal(f.client.importLocal(), true);
  assert.equal(f.client.state.items.length, 100); assert.equal(f.client.state.pending, true);
  await f.client.sync(); assert.equal(f.remote().length, 100);
  assert.equal(f.remote().filter(item => /凡人修仙传/.test(item.title)).length, 1);
  assert.equal(JSON.parse(f.storage.getItem('video-favorites')).length, 100);
});

test('failed sync retains additions and deletions across reloads and merges cloud edits on recovery', async t => {
  let offline = false;
  const first = fixture(t, { remote: [film()], fetchImpl: async () => offline ? new Response('<html>quota</html>', { status: 503 }) : null });
  await first.client.initialize(); offline = true; first.client.changed([film('13')]); assert.equal(await first.client.sync(), false); assert.equal(first.client.state.pending, true); assert.equal(first.client.state.phase, 'offline');
  const restored = fixture(t, { storage: first.storage, remote: [film(), film('14')] });
  await restored.client.initialize(); assert.deepEqual(new Set(restored.client.state.items.map(item => item.id)), new Set(['13', '14'])); assert.equal(restored.client.state.pending, false);
  assert.deepEqual(new Set(restored.remote().map(item => item.id)), new Set(['13', '14']));
});

test('revision conflicts preserve independent edits and never resurrect a favorite removed remotely', async t => {
  let conflict = true;
  const f = fixture(t, { remote: [film()], fetchImpl: async (_url, init) => init.method === 'PUT' && conflict ? (conflict = false, Response.json({ user, version: 0, items: [film('14')], code: 'favorites_conflict' }, { status: 409 })) : null });
  await f.client.initialize(); f.client.changed([film(), film('13')]); await f.client.sync();
  assert.deepEqual(new Set(f.client.state.items.map(item => item.id)), new Set(['13', '14'])); assert.equal(f.client.state.pending, false);
});

test('favorite changes during upload stay pending and are sent without being overwritten by the earlier response', async t => {
  let release; let intercept = false;
  const f = fixture(t, { fetchImpl: async (_url, init) => init.method === 'PUT' && intercept ? (intercept = false, new Promise(resolve => { release = resolve; })) : null });
  await f.client.initialize(); f.client.changed([film()]); intercept = true; const syncing = f.client.sync();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.client.changed([film(), film('13')]); release(Response.json({ user, version: 0, items: [film()] })); await syncing;
  assert.deepEqual(f.remote().map(item => item.id), ['13', '12']); assert.equal(f.client.state.pending, false);
});

test('expired sessions retain their account scope and backend quota never signs a user out', async t => {
  const f = fixture(t, { fetchImpl: async url => url.endsWith('/favorites') ? Response.json({ error: 'expired', code: 'session_expired' }, { status: 401 }) : null });
  f.client.changed([film()]); await f.client.initialize(); assert.equal(f.client.state.phase, 'expired'); assert.equal(f.client.state.user.id, user.id); assert.deepEqual(f.client.state.items, [film()]); assert.equal(await f.client.sync(), false);
  assert.equal(JSON.parse(f.storage.getItem('video-account-session-v1')).token, '');
  const quota = fixture(t, { fetchImpl: async () => Response.json({ code: 'backend_unavailable' }, { status: 503 }) });
  quota.client.changed([film()]); await quota.client.initialize(); assert.equal(quota.client.state.phase, 'offline'); assert.equal(quota.client.state.user.id, user.id); assert.equal(JSON.parse(quota.storage.getItem('video-account-session-v1')).token, token);
});

test('OAuth completion consumes tab proof, clears the callback URL first and returns to the previous page', async t => {
  const f = fixture(t, { loggedIn: false });
  assert.ok((await f.client.login('https://site.example/video/', '#search?q=凡人')).startsWith('https://github.com/'));
  const proof = JSON.parse(f.tabStorage.getItem('video-account-login-v1')); assert.equal(proof.verifier.length, 43);
  await f.client.initialize('#account?ticket=' + 'a'.repeat(43)); assert.deepEqual(f.callbacks, ['#search?q=凡人']); assert.equal(f.client.state.user.id, '12'); assert.equal(f.tabStorage.getItem('video-account-login-v1'), null);
  const payload = JSON.parse(f.calls.find(call => call.url.endsWith('/exchange')).init.body); assert.equal(payload.verifier, proof.verifier); assert.equal(f.client.state.enabled, true);
});

test('a session expiring while the page stays open exposes re-login and retains unsynced favorites', async t => {
  let time = 1000000;
  const f = fixture(t, { now: () => time }); await f.client.initialize(); f.client.changed([film()]);
  const calls = f.calls.length; time = 1e12;
  assert.equal(await f.client.sync(), false); assert.equal(f.client.state.phase, 'expired'); assert.equal(f.client.state.pending, true);
  assert.deepEqual(f.client.state.items, [film()]); assert.match(f.client.state.message, /重新登录/); assert.equal(f.calls.length, calls);
});

test('invalid callbacks, blocked storage, wrong accounts and corrupted sessions fail safely without clearing local collections', async t => {
  for (const error of ['expired', 'cancelled', 'invitation', 'full', 'unavailable', 'unknown']) {
    const f = fixture(t, { loggedIn: false }); await f.client.initialize('#account?error=' + error); assert.ok(f.client.state.message); assert.equal(f.client.state.user, null);
  }
  const invalid = fixture(t, { loggedIn: false }); await invalid.client.initialize('#account?ticket=bad'); assert.match(invalid.client.state.message, /过期/);
  const wrong = fixture(t, { fetchImpl: async url => url.endsWith('/favorites') ? Response.json({ user: { ...user, id: '99' }, items: [], version: 0 }) : null }); wrong.client.changed([film()]); await wrong.client.sync(); assert.deepEqual(wrong.client.state.items, [film()]); assert.equal(wrong.client.state.phase, 'offline');
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  const blocked = fixture(t, { loggedIn: false, storage, tabStorage: storage }); blocked.client.changed([film()]); assert.match(blocked.client.state.message, /无法保存/); await assert.rejects(blocked.client.login('https://site.example/video/'), /无法保存/);
  const hostile = fixture(t, { loggedIn: false, fetchImpl: async url => url.endsWith('/login') ? Response.json({ url: 'https://bad.example' }) : null }); await assert.rejects(hostile.client.login('https://site.example/video/'), /地址/);
  assert.throws(() => invalid.client.changed(Array.from({ length: 101 }, () => film())));
});

test('cross-tab account switches cancel stale sync responses and keep each account and guest collection isolated', async t => {
  let release; let stall = false;
  const f = fixture(t, { fetchImpl: async url => url.endsWith('/favorites') && stall ? new Promise(resolve => { release = resolve; }) : null });
  await f.client.initialize(); stall = true; const pending = f.client.sync(); while (!release) await new Promise(resolve => setImmediate(resolve));
  const other = { id: '13', login: 'other' }; f.storage.setItem(favoriteStorageKey(other), JSON.stringify([film('14')])); f.storage.setItem('video-account-session-v1', JSON.stringify({ user: other, token: 'o'.repeat(43), expiresAt: 1e12 }));
  assert.equal(f.client.refreshSession(), true); release(Response.json({ user, items: [film()], version: 1 })); assert.equal(await pending, false);
  assert.equal(f.client.state.user.id, '13'); assert.deepEqual(f.client.state.items, [film('14')]); assert.equal(f.client.refreshSession(), false);
  f.storage.removeItem('video-account-session-v1'); assert.equal(f.client.refreshSession(), true); assert.equal(f.client.state.user, null);
});

test('consecutive edits and storage refresh retain unsaved favorites when persistence fails', async t => {
  const storage = memory(); const originalSet = storage.setItem; let blocked = false;
  storage.setItem = (key, value) => { if (blocked) throw new Error('quota'); originalSet(key, value); };
  const f = fixture(t, { storage, remote: [film()] }); await f.client.initialize(); blocked = true;
  f.client.changed([film(), film('13')]);
  assert.equal(f.client.refreshLocal(), false);
  f.client.changed([film(), film('13'), film('14')]);
  assert.deepEqual(new Set(f.client.state.items.map(item => item.id)), new Set(['12', '13', '14']));
  assert.match(f.client.state.message, /无法保存/);
});

test('successful guest persistence clears only the client save warning and retains sync errors', async t => {
  const storage = memory(); const originalSet = storage.setItem; let blocked = true;
  storage.setItem = (key, value) => { if (blocked) throw new Error('quota'); originalSet(key, value); };
  const guest = fixture(t, { loggedIn: false, storage });
  guest.client.changed([film()]); assert.match(guest.client.state.message, /无法保存/);
  blocked = false; guest.client.changed([film(), film('13')]);
  assert.equal(guest.client.state.message, '');
  for (const status of [401, 503]) {
    const f = fixture(t, { fetchImpl: async url => url.endsWith('/favorites') ? Response.json({ error: 'sync failed' }, { status }) : null });
    await f.client.initialize(); const message = f.client.state.message;
    f.client.changed([film()]); assert.equal(f.client.state.message, message);
    assert.equal(f.client.state.phase, status === 401 ? 'expired' : 'offline');
  }
});

test('login blocks navigation for unpersisted guest edits and retries normally after storage recovers', async t => {
  const storage = memory(); const originalSet = storage.setItem; let blocked = true;
  storage.setItem = (key, value) => { if (blocked) throw new Error('quota'); originalSet(key, value); };
  const f = fixture(t, { loggedIn: false, storage }); f.client.changed([film()]);
  await assert.rejects(f.client.login('https://site.example/video/'), /恢复存储.*导出.*再.*登录/);
  assert.equal(f.calls.some(call => call.url.endsWith('/login')), false);
  assert.equal(f.tabStorage.getItem('video-account-login-v1'), null);
  assert.deepEqual(f.client.state.items, [film()]);
  blocked = false; assert.ok((await f.client.login('https://site.example/video/')).startsWith('https://github.com/'));
  assert.deepEqual(JSON.parse(storage.getItem('video-favorites')), [film()]);
});

test('expired account login preserves pending edits until local storage can save them', async t => {
  const storage = memory(); const originalSet = storage.setItem; let blocked = false;
  storage.setItem = (key, value) => { if (blocked && key !== 'video-account-session-v1') throw new Error('quota'); originalSet(key, value); };
  const f = fixture(t, { storage, remote: [film()] }); await f.client.initialize(); blocked = true;
  f.client.changed([film(), film('13')]);
  storage.setItem('video-account-session-v1', JSON.stringify({ user, token: '', expiresAt: 1e12 })); f.client.refreshSession();
  assert.equal(f.client.state.phase, 'expired'); assert.equal(f.client.state.pending, true);
  await assert.rejects(f.client.login('https://site.example/video/'), /恢复存储.*导出/);
  assert.equal(f.calls.some(call => call.url.endsWith('/login')), false);
  blocked = false; await f.client.login('https://site.example/video/');
  assert.deepEqual(new Set(JSON.parse(storage.getItem(favoriteStorageKey(user))).map(item => item.id)), new Set(['12', '13']));
});

test('cloud-saved account collections and unchanged guest storage do not prevent login when persistence is unavailable', async t => {
  const storage = memory(); const originalSet = storage.setItem; let blocked = false;
  storage.setItem = (key, value) => { if (blocked) throw new Error('quota'); originalSet(key, value); };
  const f = fixture(t, { storage, remote: [film()] }); await f.client.initialize(); blocked = true;
  assert.equal(f.client.state.pending, false);
  assert.ok((await f.client.login('https://site.example/video/')).startsWith('https://github.com/'));
  const guestStorage = memory(); guestStorage.setItem('video-favorites', JSON.stringify([film()]));
  guestStorage.setItem = () => { throw new Error('quota'); };
  const guest = fixture(t, { loggedIn: false, storage: guestStorage });
  assert.ok((await guest.client.login('https://site.example/video/')).startsWith('https://github.com/'));
});
