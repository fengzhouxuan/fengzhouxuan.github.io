import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountService } from '../auth.js';
import { cleanFavorites } from '../favorites.js';
import { createD1 } from './fixtures/d1.cjs';

const origin = 'https://site.example';
const serviceURL = 'https://api.example';
const encode = bytes => Buffer.from(bytes).toString('base64url');
const digest = async value => encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const verifier = 'p'.repeat(43);
const film = cleanFavorites([{ uid: 'liangzi:12', source: 'liangzi', id: '12', title: '测试影片' }])[0];

function fixture(t, options = {}) {
  const db = createD1(['0001_accounts', '0002_music_library'].map(name => new URL('../migrations/' + name + '.sql', import.meta.url))); t.after(() => db.close());
  let time = 1000000; const calls = [];
  const env = { VIDEO_DB: db, VIDEO_ALLOWED_ORIGINS: origin, VIDEO_SITE_URL: origin + '/video/', VIDEO_GITHUB_CLIENT_ID: 'public-client', VIDEO_GITHUB_CLIENT_SECRET: 'server-secret', VIDEO_GITHUB_ALLOWLIST: 'tester', ...options.env };
  const user = { id: 12, login: 'tester', avatar_url: 'https://avatars.githubusercontent.com/12' };
  const handler = createAccountService({ now: () => time, fetchImpl: async (url, init) => { calls.push({ url, init }); return options.fetchImpl ? options.fetchImpl(url, init) : Response.json(url.endsWith('access_token') ? { access_token: 'github-private-token' } : user); } });
  const request = (path, { method = 'GET', body, token, from = origin, headers = {} } = {}) => handler(new Request(serviceURL + '/api/account/' + path, { method, headers: { ...(from ? { Origin: from } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env);
  async function start(extra = {}) { return (await request('login', { method: 'POST', body: { challenge: await digest(verifier), returnTo: origin + '/video/', ...extra } })).json(); }
  async function callback(login = null, extra = '') {
    const authorization = new URL((login || await start()).url);
    return request('callback?code=github-code&state=' + authorization.searchParams.get('state') + extra, { from: null });
  }
  async function session() { const response = await callback(); const ticket = new URL(response.headers.get('Location')).hash.slice(9); return (await request('exchange', { method: 'POST', body: { ticket: new URLSearchParams(ticket).get('ticket'), verifier } })).json(); }
  return { db, env, calls, user, request, start, callback, session, advance: ms => { time += ms; } };
}

test('account routes enforce exact CORS, JSON bodies and safe return destinations; unconfigured service degrades clearly', async t => {
  const f = fixture(t);
  assert.deepEqual(await (await f.request('config')).json(), { enabled: true });
  const good = await f.request('login', { method: 'OPTIONS' }); assert.equal(good.status, 204); assert.equal(good.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
  for (const from of ['https://bad.example', null]) { const denied = await f.request('login', { method: 'POST', from }); assert.equal(denied.status, 403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null); }
  assert.equal((await f.request('login', { method: 'OPTIONS', from: 'https://bad.example' })).status, 403);
  for (const body of ['{broken', { returnTo: 'bad' }, { challenge: verifier, returnTo: 'https://bad.example/video/' }, { challenge: verifier, returnTo: origin + '/video/?private=1' }, { challenge: verifier, returnTo: origin + '/wrong/' }, { challenge: verifier, returnTo: 'http://site.example/video/' }, 'x'.repeat(350001)]) assert.equal((await f.request('login', { method: 'POST', body })).status, 400);
  assert.equal((await f.request('login', { method: 'POST', body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 400);
  f.env.VIDEO_GITHUB_CLIENT_SECRET = ''; assert.deepEqual(await (await f.request('config')).json(), { enabled: false }); assert.equal((await f.request('login', { method: 'POST' })).status, 503);
});

test('GitHub login uses state and PKCE, reads public identity, exchanges one-use tickets and never exposes GitHub secrets', async t => {
  const f = fixture(t); const login = await f.start(); const authorize = new URL(login.url);
  assert.equal(authorize.searchParams.get('scope'), ''); assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256'); assert.equal(authorize.searchParams.get('redirect_uri'), serviceURL + '/api/account/callback');
  assert.equal(authorize.searchParams.has('client_secret'), false);
  const callback = await f.callback(login); assert.equal(callback.status, 303);
  const params = new URLSearchParams(new URL(callback.headers.get('Location')).hash.slice(9)); const ticket = params.get('ticket');
  assert.equal((await f.request('exchange', { method: 'POST', body: { ticket, verifier: 'z'.repeat(43) } })).status, 401);
  const session = await (await f.request('exchange', { method: 'POST', body: { ticket, verifier } })).json();
  assert.equal(session.user.id, '12'); assert.equal(session.token.length, 43); assert.doesNotMatch(JSON.stringify(session), /github-private-token|server-secret/);
  assert.equal((await f.request('exchange', { method: 'POST', body: { ticket, verifier } })).status, 401);
  assert.equal(new URL((await f.callback(login)).headers.get('Location')).hash, '#account?error=expired');
  const rows = f.db.database.prepare('SELECT * FROM video_sessions').all(); assert.equal(rows[0].token_hash, await digest(session.token)); assert.notEqual(rows[0].token_hash, session.token);
  assert.equal(f.calls[1].init.headers.Authorization, 'Bearer github-private-token');
});

test('account favorites are isolated, sanitized, revision protected, and logout invalidates only its own session', async t => {
  const f = fixture(t); const session = await f.session();
  for (const token of [null, 'bad', 'z'.repeat(43)]) assert.equal((await f.request('favorites', { token })).status, 401);
  assert.equal((await f.request('favorites', { token: session.token, from: 'https://bad.example' })).status, 403);
  const first = await (await f.request('favorites', { token: session.token })).json(); assert.deepEqual(first.items, []); assert.equal(first.version, 0);
  const saved = await (await f.request('favorites', { token: session.token, method: 'PUT', body: { version: 0, items: [{ ...film, position: 25, lines: ['private'] }] } })).json();
  assert.equal(saved.version, 1); assert.deepEqual(saved.items, [film]);
  const conflict = await f.request('favorites', { token: session.token, method: 'PUT', body: { version: 0, items: [] } }); assert.equal(conflict.status, 409); assert.deepEqual((await conflict.json()).items, [film]);
  for (const body of [{ version: -1, items: [] }, { version: 1, items: [{}] }, '{bad']) assert.equal((await f.request('favorites', { token: session.token, method: 'PUT', body })).status, 400);
  f.user.id = 13; const other = await f.session(); assert.deepEqual((await (await f.request('favorites', { token: other.token })).json()).items, []);
  assert.equal((await f.request('unknown', { token: session.token })).status, 405);
  assert.equal((await f.request('favorites', { method: 'POST', token: session.token })).status, 405);
  assert.equal((await f.request('logout', { token: session.token, method: 'POST' })).status, 200);
  assert.equal((await f.request('favorites', { token: session.token })).status, 401); assert.equal((await f.request('favorites', { token: other.token })).status, 200);
  f.advance(31 * 86400000); assert.equal((await f.request('favorites', { token: other.token })).status, 401);
});

test('GitHub requests use the Worker redirect contract and reject redirect responses before reading their bodies', async t => {
  const compatible = fixture(t, { fetchImpl: async (url, init) => {
    if (init.redirect !== 'manual') throw new TypeError('Unsupported redirect mode');
    return Response.json(url.endsWith('access_token') ? { access_token: 'github-private-token' } : { id: 12, login: 'tester', avatar_url: '' });
  } });
  assert.equal((await compatible.session()).user.login, 'tester');
  for (const stage of ['token', 'identity']) {
    let bodyReads = 0;
    const redirected = fixture(t, { fetchImpl: async url => {
      if (stage === 'identity' && url.endsWith('access_token')) return Response.json({ access_token: 'github-private-token' });
      const response = new Response(null, { status: 307, headers: { Location: 'https://untrusted.example/' } });
      response.json = async () => { bodyReads++; throw new Error('private redirect body'); };
      return response;
    } });
    assert.match((await redirected.callback()).headers.get('Location'), /error=unavailable/);
    assert.equal(bodyReads, 0);
    assert.equal(redirected.calls.length, stage === 'token' ? 1 : 2);
    assert.ok(redirected.calls.every(call => call.init.redirect === 'manual'));
    assert.equal(redirected.db.database.prepare('SELECT COUNT(*) AS total FROM video_users').get().total, 0);
  }
});

test('expired, denied, non-invited and failed logins never create a usable session', async t => {
  const f = fixture(t);
  assert.equal(new URL((await f.request('callback?state=bad')).headers.get('Location')).hash, '#account?error=expired');
  const cancelled = await f.callback(null, '&error=access_denied'); assert.match(cancelled.headers.get('Location'), /error=cancelled/);
  const missing = new URL((await f.start()).url); assert.match((await f.request('callback?state=' + missing.searchParams.get('state'))).headers.get('Location'), /error=expired/);
  const old = await f.start(); f.advance(600001); assert.match((await f.callback(old)).headers.get('Location'), /error=expired/);
  f.user.login = 'uninvited'; assert.match((await f.callback()).headers.get('Location'), /error=invitation/);
  f.user.login = 'tester'; f.env.VIDEO_USER_LIMIT = '1'; await f.session(); f.user.id = 13; assert.match((await f.callback()).headers.get('Location'), /error=full/);
  f.user.id = 12; assert.ok((await f.session()).token);
  assert.equal((await f.request('exchange', { method: 'POST', body: {} })).status, 400); assert.equal((await f.request('exchange', { method: 'POST', body: '{bad' })).status, 400);
  const broken = fixture(t, { fetchImpl: async () => { throw new Error('private upstream detail'); } }); assert.match((await broken.callback()).headers.get('Location'), /error=unavailable/);
  const invalid = fixture(t, { fetchImpl: async () => Response.json({ access_token: 'x', id: -1 }) }); assert.match((await invalid.callback()).headers.get('Location'), /error=unavailable/);
  const quota = createAccountService(); const response = await quota(new Request(serviceURL + '/api/account/favorites', { headers: { Origin: origin, Authorization: 'Bearer ' + verifier } }), { ...f.env, VIDEO_DB: { prepare() { throw new Error('D1 private quota detail'); } } });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private/);
});

test('pending login records are bounded and expired records are cleaned without deleting active sessions', async t => {
  const f = fixture(t);
  for (let index = 0; index < 100; index++) f.db.database.prepare('INSERT INTO video_oauth_flows VALUES (?, ?, ?, ?, ?)').run(String(index), verifier, verifier, origin, 2000000);
  assert.equal((await f.request('login', { method: 'POST', body: { challenge: await digest(verifier), returnTo: origin + '/video/' } })).status, 429);
  f.advance(2000000); assert.ok((await f.start()).url); assert.equal(f.db.database.prepare('SELECT COUNT(*) AS count FROM video_oauth_flows').get().count, 1);
});

test('music and video share one OAuth session with separate account data and independent revisions', async t => {
  const f = fixture(t);
  const login = await f.start({ returnTo: origin + '/music/' });
  const callback = await f.callback(login); assert.match(callback.headers.get('Location'), /^https:\/\/site\.example\/music\/#account\?/);
  const ticket = new URLSearchParams(new URL(callback.headers.get('Location')).hash.slice(9)).get('ticket');
  const session = await (await f.request('exchange', { method: 'POST', body: { ticket, verifier } })).json();
  const items = { favorites: [{ uid: 'netease-12', source: 'netease', songid: '12', title: '测试歌曲', audioUrl: 'https://private.example/audio', lrc: 'lyrics' }], playlists: [{ id: 'pl-test', name: '我的歌单', tracks: [] }] };
  assert.deepEqual((await (await f.request('music', { token: session.token })).json()).items, { favorites: [], playlists: [] });
  const music = await (await f.request('music', { token: session.token, method: 'PUT', body: { version: 0, items } })).json();
  assert.equal(music.version, 1); assert.equal(music.items.favorites[0].audioUrl, undefined); assert.equal(music.items.favorites[0].lrc, undefined);
  const video = await (await f.request('favorites', { token: session.token, method: 'PUT', body: { version: 0, items: [film] } })).json();
  assert.equal(video.version, 1); assert.deepEqual(video.items, [film]);
  assert.equal((await (await f.request('music', { token: session.token })).json()).version, 1);
  const conflict = await f.request('music', { token: session.token, method: 'PUT', body: { version: 0, items: { favorites: [], playlists: [] } } });
  assert.equal(conflict.status, 409); assert.deepEqual((await conflict.json()).items, music.items);
  for (const body of ['{bad', { version: -1, items }, { version: 1, items: { ...items, playlists: [{ id: '../bad', tracks: [] }] } }]) assert.equal((await f.request('music', { token: session.token, method: 'PUT', body })).status, 400);
  assert.equal((await f.request('music', { token: session.token, method: 'POST' })).status, 405);
  assert.equal((await f.request('music', { token: session.token, from: 'https://bad.example' })).status, 403);
  f.user.id = 13; const other = await f.session();
  assert.deepEqual((await (await f.request('music', { token: other.token })).json()).items, { favorites: [], playlists: [] });
  await f.request('logout', { token: session.token, method: 'POST' });
  assert.equal((await f.request('music', { token: session.token })).status, 401);
});
