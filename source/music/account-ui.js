import { createMusicAccountClient } from './shared/music-account.js';
import { ACCOUNT_SESSION_KEY } from './shared/account-client.js';
import { musicLibraryStorageKey } from './shared/music-library.js';
import config from './config.js';

export function attachMusicAccount({ applyLibrary, showToast, getLanguage = () => 'zh' }) {
  const get = id => document.getElementById(id);
  let storage = null; let tabStorage = null; let client; let libraryOwner; let loggingIn = false;
  try { storage = window.localStorage; } catch { /* The shared client reports unavailable persistence. */ }
  try { tabStorage = window.sessionStorage; } catch { /* Login needs the per-tab proof. */ }
  const panel = get('music-account-panel');
  function render(value = client?.state) {
    if (!value) return;
    const english = getLanguage() === 'en';
    const say = (zh, en) => english ? en : zh;
    const loggedIn = Boolean(value.user);
    get('music-account-label').textContent = loggedIn ? value.user.login : say('登录同步', 'Sign in');
    get('music-account-heading').textContent = loggedIn ? say(value.user.login + ' 的音乐库', value.user.login + '’s library') : say('让歌单跟着你走', 'Take your music with you');
    get('music-account-status').textContent = value.message || (!loggedIn
      ? value.enabled === false ? say('账号服务暂未配置，本机歌单可以正常使用。', 'Account sync is not configured. Your local library remains available.') : say('使用受邀的 GitHub 账号，同步收藏歌曲和自建歌单。', 'Use an invited GitHub account to sync favorites and playlists.')
      : value.phase === 'syncing' ? say('正在同步音乐库…', 'Syncing your library…')
      : value.pending ? say('有修改等待同步，已保留在本机。', 'Changes saved locally, awaiting sync.')
      : value.lastSync ? say('已同步 · ', 'Synced · ') + new Date(value.lastSync).toLocaleTimeString(english ? 'en' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })
      : say('歌单保留在本机，点击同步获取云端音乐库。', 'Sync to load your cloud library.'));
    get('music-account-status').classList.toggle('error', ['offline', 'expired', 'error'].includes(value.phase));
    get('music-account-login').hidden = loggedIn && value.phase !== 'expired';
    get('music-account-login').disabled = value.enabled === false || loggingIn;
    get('music-account-login').textContent = value.phase === 'expired' ? say('重新用 GitHub 登录', 'Sign in again') : say('GitHub 登录', 'Sign in with GitHub');
    get('music-account-sync').hidden = !loggedIn;
    get('music-account-sync').disabled = ['syncing', 'expired'].includes(value.phase);
    get('music-account-sync').textContent = say('立即同步', 'Sync now');
    get('music-account-logout').hidden = !loggedIn;
    get('music-account-logout').textContent = say('退出登录', 'Sign out');
    const count = client?.localCount() || 0;
    get('music-account-import').hidden = !loggedIn || !count;
    get('music-account-import').textContent = say('导入本机歌单与收藏', 'Import local library');
    get('music-library-note').textContent = loggedIn ? say('当前音乐库属于 ', 'Library for ') + value.user.login + say('，修改后自动同步。', '. Changes sync automatically.') : say('收藏和自建歌单保存在本机；登录后可以跨设备同步。', 'Favorites and playlists are saved locally. Sign in to sync across devices.');
  }
  client = createMusicAccountClient({
    base: config.accountApiBase, storage, tabStorage,
    onChange: render,
    onScope(value) {
      const owner = value.user?.id ?? null;
      const scopeChanged = owner !== libraryOwner; libraryOwner = owner;
      applyLibrary(value.items, { scopeChanged });
    },
    onLibrary: applyLibrary,
    onCallback(hash) { history.replaceState(null, '', location.pathname + location.search + hash); panel.open = true; },
  });
  get('music-account-login').addEventListener('click', async () => {
    if (loggingIn) return;
    loggingIn = true; render();
    try { location.assign(await client.login(location.origin + location.pathname, location.hash || '#library')); }
    catch (error) { loggingIn = false; showToast(error.message); render(); }
  });
  get('music-account-sync').addEventListener('click', () => client.sync());
  get('music-account-import').addEventListener('click', () => {
    try { client.importLocal(); showToast(getLanguage() === 'en' ? 'Local library imported. The original stays on this device.' : '已加入当前账号，本机原歌单和收藏仍保留。'); }
    catch (error) { showToast(error.message); }
  });
  get('music-account-logout').addEventListener('click', () => client.logout());
  window.addEventListener('storage', event => {
    if (event.storageArea !== storage) return;
    if (event.key === ACCOUNT_SESSION_KEY || event.key === null) { if (client.refreshSession()) client.sync(); }
    if (event.key === musicLibraryStorageKey(client.state.user) || event.key === null) client.refreshLocal();
  });
  window.addEventListener('online', () => client.sync());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { client.refreshSession(); if (client.state.user && Date.now() - client.state.lastSync > 60000) client.sync(); }
  });
  document.addEventListener('click', event => { if (panel.open && !panel.contains(event.target)) panel.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.open) { panel.open = false; get('music-account-summary').focus(); }
  });
  client.initialize(location.hash); render();
  return { ...client, render };
}
