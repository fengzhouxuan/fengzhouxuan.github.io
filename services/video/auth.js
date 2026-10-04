import { safeURL } from './core.js';
import { cleanFavorites } from './favorites.js';
import { cleanMusicLibrary, EMPTY_MUSIC_LIBRARY } from './shared/music-library.js';

const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const hash = async value => encode(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const publicUser = row => ({ id: row.github_id, login: row.login, avatar: row.avatar });

export function createAccountService({ fetchImpl = fetch, now = Date.now } = {}) {
  return async (request, env = {}) => {
    const allowedOrigins = (env.VIDEO_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Origin' });
    if (origin && allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin); headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    const send = (status, data) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
    const callback = url.origin + '/api/account/callback';
    const site = env.VIDEO_SITE_URL || 'https://fengzhouxuan.github.io/video/';
    const redirect = (returnTo, params) => new Response(null, { status: 303, headers: { Location: returnTo + '#account?' + new URLSearchParams(params), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
    const db = env.VIDEO_DB;
    const enabled = Boolean(db && env.VIDEO_GITHUB_CLIENT_ID && env.VIDEO_GITHUB_CLIENT_SECRET);
    const row = (sql, ...args) => db.prepare(sql).bind(...args).first();
    async function body() {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('请求格式不正确');
      const text = await request.text(); if (encoder.encode(text).length > (url.pathname === '/api/account/music' ? 1100000 : 350000)) throw new Error('请求内容过大');
      return JSON.parse(text);
    }
    try {
      if (request.method === 'OPTIONS') return origin && allowedOrigins.includes(origin) ? send(204) : send(403, { code: 'origin_denied', error: '这个页面不能访问账号服务' });
      if (url.pathname === '/api/account/config' && request.method === 'GET') return send(200, { enabled });
      if (url.pathname !== '/api/account/callback' && (!origin || !allowedOrigins.includes(origin))) return send(403, { code: 'origin_denied', error: '这个页面不能访问账号服务' });
      if (!enabled) return send(503, { code: 'account_unconfigured', error: '账号同步正在准备中，本地收藏可以正常使用' });
      if (url.pathname === '/api/account/login' && request.method === 'POST') {
        let data; try { data = await body(); } catch { return send(400, { error: '登录请求格式不正确' }); }
        let returnTo;
        try { returnTo = new URL(data.returnTo); } catch { return send(400, { error: '返回页面不正确' }); }
        if (!validToken(data.challenge) || returnTo.origin !== origin || !allowedOrigins.includes(returnTo.origin) || returnTo.username || returnTo.password || returnTo.search || returnTo.hash || ![new URL(site).pathname, '/video/', '/music/', '/'].includes(returnTo.pathname) || returnTo.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(returnTo.hostname)) return send(400, { error: '登录参数不正确' });
        await db.batch(['video_oauth_flows', 'video_login_tickets', 'video_sessions'].map(table => db.prepare('DELETE FROM ' + table + ' WHERE expires_at < ?').bind(now())));
        const active = await row('SELECT COUNT(*) AS total FROM video_oauth_flows');
        if (active.total >= 100) return send(429, { code: 'login_busy', error: '登录请求较多，请稍后重试' });
        const state = random(); const verifier = random();
        await db.prepare('INSERT INTO video_oauth_flows (state_hash, challenge, verifier, return_to, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await hash(state), data.challenge, verifier, returnTo.href, now() + 600000).run();
        const authorize = new URL('https://github.com/login/oauth/authorize');
        for (const [key, value] of Object.entries({ client_id: env.VIDEO_GITHUB_CLIENT_ID, redirect_uri: callback, scope: '', state, code_challenge: await hash(verifier), code_challenge_method: 'S256', allow_signup: 'false' })) authorize.searchParams.set(key, value);
        return send(200, { url: authorize.href });
      }
      if (url.pathname === '/api/account/callback' && request.method === 'GET') {
        const state = url.searchParams.get('state');
        if (!validToken(state)) return redirect(site, { error: 'expired' });
        const flow = await row('DELETE FROM video_oauth_flows WHERE state_hash = ? AND expires_at > ? RETURNING *', await hash(state), now());
        if (!flow) return redirect(site, { error: 'expired' });
        if (url.searchParams.has('error')) return redirect(flow.return_to, { error: 'cancelled' });
        const code = url.searchParams.get('code'); if (!code || code.length > 256) return redirect(flow.return_to, { error: 'expired' });
        try {
          const response = await fetchImpl('https://github.com/login/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ client_id: env.VIDEO_GITHUB_CLIENT_ID, client_secret: env.VIDEO_GITHUB_CLIENT_SECRET, code, redirect_uri: callback, code_verifier: flow.verifier }), signal: AbortSignal.timeout(10000), redirect: 'manual' });
          if (!response.ok) throw new Error('login failed');
          const token = await response.json(); if (typeof token.access_token !== 'string' || token.error) throw new Error('login failed');
          const identity = await fetchImpl('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + token.access_token, Accept: 'application/vnd.github+json', 'User-Agent': 'videostation-login' }, signal: AbortSignal.timeout(10000), redirect: 'manual' });
          if (!identity.ok) throw new Error('identity failed');
          const user = await identity.json();
          if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.login !== 'string' || !/^[a-z\d-]{1,39}$/i.test(user.login)) throw new Error('identity failed');
          const allowed = (env.VIDEO_GITHUB_ALLOWLIST || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
          if (!allowed.includes(user.login.toLowerCase()) && env.VIDEO_REGISTRATION !== 'open') return redirect(flow.return_to, { error: 'invitation' });
          const limit = Math.min(100, Math.max(1, Number(env.VIDEO_USER_LIMIT) || 10));
          const account = await row('INSERT INTO video_users (github_id, login, avatar, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM video_users WHERE github_id = ?) OR (SELECT COUNT(*) FROM video_users) < ? ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, avatar = excluded.avatar RETURNING *', String(user.id), user.login, safeURL(user.avatar_url).slice(0, 2048), now(), String(user.id), limit);
          if (!account) return redirect(flow.return_to, { error: 'full' });
          const ticket = random();
          await db.prepare('INSERT INTO video_login_tickets (ticket_hash, challenge, github_id, expires_at) VALUES (?, ?, ?, ?)').bind(await hash(ticket), flow.challenge, account.github_id, now() + 120000).run();
          return redirect(flow.return_to, { ticket });
        } catch { return redirect(flow.return_to, { error: 'unavailable' }); }
      }
      if (url.pathname === '/api/account/exchange' && request.method === 'POST') {
        let data; try { data = await body(); } catch { return send(400, { error: '登录请求格式不正确' }); }
        if (!validToken(data.ticket) || !validToken(data.verifier)) return send(400, { error: '登录参数不正确' });
        const ticket = await row('DELETE FROM video_login_tickets WHERE ticket_hash = ? AND challenge = ? AND expires_at > ? RETURNING github_id', await hash(data.ticket), await hash(data.verifier), now());
        if (!ticket) return send(401, { code: 'login_expired', error: '这次登录已过期，请重新登录' });
        const account = await row('SELECT * FROM video_users WHERE github_id = ?', ticket.github_id);
        const token = random(); const expiresAt = now() + 30 * 86400000;
        await db.prepare('INSERT INTO video_sessions (token_hash, github_id, expires_at) VALUES (?, ?, ?)').bind(await hash(token), ticket.github_id, expiresAt).run();
        return send(200, { token, expiresAt, user: publicUser(account) });
      }
      const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
      if (!validToken(token)) return send(401, { code: 'session_expired', error: '请先登录后同步收藏' });
      const digest = await hash(token);
      const account = await row('SELECT u.* FROM video_sessions s JOIN video_users u ON u.github_id = s.github_id WHERE s.token_hash = ? AND s.expires_at > ?', digest, now());
      if (!account) return send(401, { code: 'session_expired', error: '登录已过期，本地收藏仍保留，请重新登录' });
      if (url.pathname === '/api/account/logout' && request.method === 'POST') {
        await db.prepare('DELETE FROM video_sessions WHERE token_hash = ?').bind(digest).run(); return send(200, { ok: true });
      }
      if (url.pathname === '/api/account/favorites') {
        const snapshot = value => ({ user: publicUser(value), items: JSON.parse(value.favorites), version: value.revision });
        if (request.method === 'GET') return send(200, snapshot(account));
        if (request.method === 'PUT') {
          let data; let items;
          try { data = await body(); items = cleanFavorites(data.items); if (!Number.isSafeInteger(data.version) || data.version < 0) throw new Error('bad revision'); } catch { return send(400, { error: '收藏信息不正确，最多保存100部影片' }); }
          const result = await row('UPDATE video_users SET favorites = ?, revision = revision + 1 WHERE github_id = ? AND revision = ? RETURNING *', JSON.stringify(items), account.github_id, data.version);
          if (result) return send(200, snapshot(result));
          return send(409, { code: 'favorites_conflict', ...snapshot(await row('SELECT * FROM video_users WHERE github_id = ?', account.github_id)) });
        }
      }
      if (url.pathname === '/api/account/music') {
        const current = () => row("SELECT * FROM account_libraries WHERE github_id = ? AND namespace = 'music'", account.github_id);
        const snapshot = value => ({ user: publicUser(account), items: value ? cleanMusicLibrary(JSON.parse(value.data)) : EMPTY_MUSIC_LIBRARY, version: value?.revision || 0 });
        if (request.method === 'GET') return send(200, snapshot(await current()));
        if (request.method === 'PUT') {
          let data; let items;
          try { data = await body(); items = cleanMusicLibrary(data.items); if (!Number.isSafeInteger(data.version) || data.version < 0) throw new Error('同步版本不正确'); }
          catch (error) { return send(400, { error: error.message }); }
          await db.prepare("INSERT OR IGNORE INTO account_libraries (github_id, namespace) VALUES (?, 'music')").bind(account.github_id).run();
          const result = await row("UPDATE account_libraries SET data = ?, revision = revision + 1 WHERE github_id = ? AND namespace = 'music' AND revision = ? RETURNING *", JSON.stringify(items), account.github_id, data.version);
          return result ? send(200, snapshot(result)) : send(409, { code: 'library_conflict', ...snapshot(await current()) });
        }
      }
      return send(405, { error: '不支持这个账号操作' });
    } catch { return send(503, { code: 'account_unavailable', error: '收藏同步暂时不可用，已保存到本机，恢复后可继续同步' }); }
  };
}
