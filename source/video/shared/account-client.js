// Keep the existing session key so deployed video sessions continue to work.
export const ACCOUNT_SESSION_KEY = 'video-account-session-v1';
const sessionKey = ACCOUNT_SESSION_KEY;
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const tokenValid = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const userValid = user => user && /^\d{1,20}$/.test(String(user.id)) && typeof user.login === 'string' && /^[a-z\d-]{1,39}$/i.test(user.login);

export function createLibraryAccountClient({ library, base = '', storage = null, tabStorage = null, fetchImpl = fetch, now = Date.now, onChange = () => {}, onScope = () => {}, onData = () => {}, onCallback = () => {} } = {}) {
  const loginKey = library.loginKey;
  const label = library.label || '收藏';
  const cleanData = library.clean;
  const storageKey = library.storageKey;
  const mergeData = library.merge;
  const endpoint = base.replace(/\/$/, '');
  const state = { user: null, enabled: null, phase: 'local', pending: false, items: copy(library.empty), lastSync: 0, message: '' };
  let session = null; let baseline = copy(library.empty); let version = 0; let generation = 0; let pending; let controller; let timer;
  const metaKey = () => library.namespace + '-cloud:' + state.user?.id;
  function read(key, fallback) { try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function write(key, value) { try { storage?.setItem(key, JSON.stringify(value)); return Boolean(storage); } catch { return false; } }
  function readItems(user) { try { return cleanData(library.read(storage, user)); } catch { return copy(library.empty); } }
  function remember() {
    state.pending = Boolean(state.user && !equal(state.items, baseline));
    const saved = write(storageKey(state.user), state.items);
    if (state.user) write(metaKey(), { baseline, version, lastSync: state.lastSync });
    if (!saved) state.message = `浏览器无法保存，${label}只保留在本次打开的页面中；请保持页面打开直到同步完成。`;
    onChange(state);
  }
  function scope(next) {
    generation++; controller?.abort(); clearTimeout(timer); pending = null;
    session = next; state.user = next?.user || null; state.items = readItems(state.user);
    const meta = state.user ? read(metaKey(), {}) : {};
    try { baseline = cleanData(meta.baseline || library.empty); } catch { baseline = copy(library.empty); }
    version = Number.isSafeInteger(meta.version) && meta.version >= 0 ? meta.version : 0;
    state.lastSync = Number.isFinite(meta.lastSync) ? meta.lastSync : 0;
    state.pending = Boolean(state.user && !equal(state.items, baseline));
    state.phase = !state.user ? 'local' : tokenValid(session.token) && session.expiresAt > now() ? 'idle' : 'expired';
    state.message = state.phase === 'expired' ? `登录已过期，${label}仍在本机，请重新登录后同步。` : '';
    onScope(state); onChange(state);
  }
  function storedSession() {
    const saved = read(sessionKey, null);
    return userValid(saved?.user) && Number.isFinite(saved.expiresAt) && (tokenValid(saved.token) || saved.token === '') ? saved : null;
  }
  scope(storedSession());

  async function api(path, options = {}, authenticated = false, signal) {
    const response = await fetchImpl(endpoint + '/api/account/' + path, {
      ...options, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
      credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { Authorization: 'Bearer ' + session?.token } : {}) },
    });
    let data; try { data = await response.json(); } catch { throw new Error(`云端暂时不可用，${label}已保留在本机。`); }
    if (!response.ok && response.status !== 409) {
      const error = new Error(typeof data?.error === 'string' ? data.error : `云端暂时不可用，${label}已保留在本机。`); error.status = response.status; error.code = data?.code; throw error;
    }
    return { ...data, conflict: response.status === 409 };
  }
  function cloudSnapshot(data) {
    if (!userValid(data.user) || String(data.user.id) !== String(state.user?.id) || !Number.isSafeInteger(data.version) || data.version < 0) throw new Error(`云端${label}信息不正确，本地${label}已保留。`);
    return { items: cleanData(data.items), version: data.version };
  }
  function apply(remote, previous = baseline) {
    state.items = mergeData(previous, state.items, remote.items);
    baseline = copy(remote.items); version = remote.version;
    onData(copy(state.items)); remember();
  }
  async function sync() {
    if (!state.user) return false;
    if (!tokenValid(session?.token) || session.expiresAt <= now()) {
      state.phase = 'expired'; state.message = `登录已过期，${label}仍在本机，请重新登录后同步。`; onChange(state); return false;
    }
    if (pending) return pending;
    clearTimeout(timer); const current = generation; controller = new AbortController(); const signal = controller.signal;
    state.phase = 'syncing'; state.message = ''; onChange(state);
    const run = (async () => {
      try {
        const data = await api(library.endpoint, {}, true, signal);
        if (current !== generation) return false;
        apply(cloudSnapshot(data));
        for (let attempt = 0; attempt < 3 && !equal(state.items, baseline); attempt++) {
          const sent = copy(state.items);
          const response = await api(library.endpoint, { method: 'PUT', body: JSON.stringify({ version, items: sent }) }, true, signal);
          if (current !== generation) return false;
          apply(cloudSnapshot(response), response.conflict ? baseline : sent);
        }
        state.phase = 'idle'; state.lastSync = now();
        remember();
        if (state.pending) timer = setTimeout(sync, 1000);
        return !state.pending;
      } catch (error) {
        if (current !== generation) return false;
        state.phase = error?.status === 401 ? 'expired' : error?.status === 400 ? 'error' : 'offline';
        if (state.phase === 'expired') { session.token = ''; write(sessionKey, session); }
        state.message = state.phase === 'expired' ? `登录已过期，本地${label}仍保留，请重新登录。` : state.phase === 'error' ? error.message : `云端暂时不可用，${label}已保留在本机，恢复后可继续同步。`;
        remember(); return false;
      } finally { if (current === generation) { pending = null; onChange(state); } }
    })();
    pending = run; return run;
  }
  function changed(items) {
    const next = cleanData(items);
    state.items = cleanData(mergeData(state.items, next, readItems(state.user)));
    onData(copy(state.items)); remember();
    if (state.user && state.phase !== 'expired') { clearTimeout(timer); timer = setTimeout(sync, 800); }
  }
  async function login(returnTo, route = '#home') {
    if (!tabStorage) throw new Error('浏览器需要允许本页保存登录状态，才能使用 GitHub 登录。');
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const verifier = encode(bytes); const challenge = encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    try { tabStorage.setItem(loginKey, JSON.stringify({ verifier, route, at: now() })); } catch { throw new Error('浏览器无法保存登录状态，请允许本页使用存储后重试。'); }
    const data = await api('login', { method: 'POST', body: JSON.stringify({ challenge, returnTo }) });
    const target = new URL(data.url);
    if (target.origin !== 'https://github.com' || target.pathname !== '/login/oauth/authorize') throw new Error('登录地址不正确，请稍后重试。');
    return target.href;
  }
  async function initialize(hash = '') {
    if (hash.startsWith('#account?')) {
      let login; try { login = JSON.parse(tabStorage?.getItem(loginKey) || 'null'); } catch { /* Treat missing proof as an expired login. */ }
      const route = typeof login?.route === 'string' && library.isRoute(login.route) ? login.route : library.defaultRoute;
      const params = new URLSearchParams(hash.slice(9)); onCallback(route);
      const messages = { expired: '这次登录已过期，请重新登录。', cancelled: `已取消登录，本地${label}仍可使用。`, invitation: '这个 GitHub 账号尚未获邀，请联系站点主人添加。', full: '账号名额已满，请联系站点主人。', unavailable: '登录服务暂时不可用，请稍后重试。' };
      try {
        if (params.has('error')) throw new Error(messages[params.get('error')] || messages.unavailable);
        if (!tokenValid(params.get('ticket')) || !tokenValid(login?.verifier) || login.at > now() || now() - login.at > 600000) throw new Error(messages.expired);
        const data = await api('exchange', { method: 'POST', body: JSON.stringify({ ticket: params.get('ticket'), verifier: login.verifier }) });
        if (!tokenValid(data.token) || !userValid(data.user) || !Number.isFinite(data.expiresAt) || data.expiresAt <= now()) throw new Error(messages.unavailable);
        write(sessionKey, { token: data.token, user: data.user, expiresAt: data.expiresAt });
        scope({ token: data.token, user: data.user, expiresAt: data.expiresAt });
      } catch (error) { state.message = error.message; onChange(state); }
      try { tabStorage?.removeItem(loginKey); } catch { /* Login proof also expires after ten minutes. */ }
    }
    try { state.enabled = (await api('config')).enabled === true; } catch { state.enabled = null; }
    onChange(state); if (state.user) await sync();
  }
  function importLocal() {
    if (!state.user) return false;
    const local = readItems(null); const combined = library.importLocal(local, state.items);
    changed(combined); onData(copy(state.items)); return true;
  }
  function logout() {
    const token = session?.token;
    try { storage?.removeItem(sessionKey); } catch { /* This tab can still sign out. */ }
    scope(null);
    if (tokenValid(token)) fetchImpl(endpoint + '/api/account/logout', { method: 'POST', credentials: 'omit', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) }).catch(() => {});
  }
  function refreshSession() {
    const next = storedSession();
    if (next?.user?.id !== session?.user?.id || next?.token !== session?.token) { scope(next); return true; }
    return false;
  }
  function refreshLocal() {
    const latest = readItems(state.user);
    if (equal(latest, state.items)) return false;
    changed(latest); return true;
  }
  return { state, initialize, login, logout, sync, changed, importLocal, refreshSession, refreshLocal, localCount: () => library.count(readItems(null)) };
}
