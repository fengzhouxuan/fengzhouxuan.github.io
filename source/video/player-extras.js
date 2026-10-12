// Browser-only controls. Reuse the existing episode panel and original video.
export function createPlayerRecovery({ screen, feedback, status, notice, isActive = () => true, onChooseSource, canChooseSource = () => true,
  getContext = () => '', setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  const doc = screen?.ownerDocument, parent = feedback?.parentElement, Observer = doc?.defaultView?.MutationObserver;
  if (!doc || !parent || !status || typeof Observer !== 'function') return null;
  const sibling = feedback.nextSibling, retry = feedback.querySelector('#retry-play'), retryLabel = retry?.textContent;
  const root = doc.createElement('div'); root.className = 'art-player-recovery'; root.hidden = true;
  root.setAttribute('role', 'group'); root.setAttribute('aria-label', '播放恢复');
  const title = doc.createElement('p'); title.className = 'art-recovery-title'; title.textContent = '播放暂时中断';
  const message = doc.createElement('p'); message.className = 'art-recovery-message';
  let source, destroyed = false, retryUntil = 0, timer, context = getContext();
  const choose = () => { if (!destroyed && (!root.hidden || !feedback.hidden) && !source?.disabled && isActive()) onChooseSource?.(); };
  if (onChooseSource) {
    source = doc.createElement('button'); source.type = 'button'; source.className = 'button ghost small art-recovery-source'; source.textContent = '选择来源';
    source.addEventListener('click', choose); feedback.insertBefore(source, retry?.nextSibling || feedback.firstChild);
  }
  root.append(title, message); screen.append(root);
  function refresh() {
    if (destroyed) return;
    const current = getContext();
    if (current !== context) { context = current; retryUntil = 0; clearTimer(timer); root.hidden = true; }
    const pending = !root.hidden && (retry?.disabled || now() < retryUntil) && isActive();
    const visible = pending || (!feedback.hidden && isActive() && (!notice || !notice.hidden)), focused = root.contains(doc.activeElement);
    if (visible && feedback.parentElement !== root) root.append(feedback);
    else if (!visible && feedback.parentElement === root) parent.insertBefore(feedback, sibling?.parentElement === parent ? sibling : null);
    root.hidden = !visible; screen.classList.toggle('playback-recovery-open', visible);
    root.classList.toggle('is-retrying', pending); root.setAttribute('aria-busy', String(pending));
    title.textContent = pending ? '正在重试当前线路' : '播放暂时中断';
    message.textContent = status.textContent || '可以重试当前线路，或选择其他来源，观看位置会尽量保留。';
    if (retry) retry.textContent = pending ? '正在重试…' : retryLabel;
    if (source) source.disabled = !canChooseSource();
    if (!visible && focused) screen.focus?.({ preventScroll: true });
  }
  const markRetry = () => {
    if (root.hidden || destroyed || !isActive()) return;
    retryUntil = now() + 400; clearTimer(timer); timer = setTimer(refresh, 400); refresh();
  };
  const guardRetryKey = event => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); };
  retry?.addEventListener('click', markRetry, { capture: true });
  retry?.addEventListener('keydown', guardRetryKey);
  // Observe the existing recovery UI instead of adding another retry controller.
  const observer = new Observer(refresh);
  observer.observe(feedback, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(status, { childList: true, characterData: true, subtree: true });
  if (notice) observer.observe(notice, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
  if (retry) observer.observe(retry, { attributes: true, attributeFilter: ['disabled'] });
  doc.defaultView.addEventListener('hashchange', refresh);
  refresh();
  return { refresh, destroy() {
    if (destroyed) return;
    destroyed = true; clearTimer(timer); observer.disconnect(); doc.defaultView.removeEventListener('hashchange', refresh);
    const focused = root.contains(doc.activeElement);
    source?.removeEventListener('click', choose); source?.remove();
    retry?.removeEventListener('click', markRetry, { capture: true });
    retry?.removeEventListener('keydown', guardRetryKey);
    parent.insertBefore(feedback, sibling?.parentElement === parent ? sibling : null);
    if (retry) retry.textContent = retryLabel;
    root.remove(); screen.classList.remove('playback-recovery-open');
    if (focused) screen.focus?.({ preventScroll: true });
  } };
}

export function createAutoNext(video, { screen, getEpisodeState = () => ({}), getAutoNext = () => true,
  onNext, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  const doc = screen?.ownerDocument;
  if (!video || !doc || !onNext) return null;
  const listeners = [];
  let card, timer, snapshot, deadline = 0, destroyed = false;
  const listen = (node, type, fn) => { node.addEventListener(type, fn); listeners.push(() => node.removeEventListener(type, fn)); };
  function cancel() {
    clearTimer(timer); timer = null; snapshot = null;
    if (card) {
      if (card.root.contains?.(doc.activeElement)) screen.focus?.({ preventScroll: true });
      card.root.remove(); card = null;
    }
  }
  function valid() {
    const state = getEpisodeState() || {};
    return !destroyed && snapshot && isActive() && !doc.hidden && getAutoNext() && video.ended && !state.loading && !state.switching
      && state.current === snapshot.current && state.key === snapshot.key
      && (video.currentSrc || video.src) === snapshot.source && state.current >= 0 && state.current + 1 < state.count;
  }
  function proceed() {
    const allowed = valid(); cancel();
    if (allowed) onNext();
  }
  function tick() {
    if (!valid()) { cancel(); return; }
    const seconds = Math.ceil(Math.max(0, deadline - now()) / 1000);
    if (!seconds) { proceed(); return; }
    card.status.textContent = seconds + ' 秒后播放下一集';
    timer = setTimer(tick, Math.min(1000, Math.max(1, deadline - now())));
  }
  function start() {
    cancel();
    const state = getEpisodeState() || {};
    snapshot = { current: state.current, key: state.key, source: video.currentSrc || video.src };
    if (!valid()) { cancel(); return; }
    const root = doc.createElement('div'); root.className = 'art-auto-next'; root.setAttribute('aria-label', '自动连播');
    const status = doc.createElement('p'); status.className = 'art-auto-next-status'; status.setAttribute('role', 'status');
    const label = doc.createElement('p'); label.className = 'art-auto-next-label'; label.textContent = state.nextLabel || '下一集';
    const actions = doc.createElement('div'); actions.className = 'art-auto-next-actions';
    const next = doc.createElement('button'); next.type = 'button'; next.textContent = '立即播放';
    const stop = doc.createElement('button'); stop.type = 'button'; stop.textContent = '取消连播';
    // Transient node listeners disappear with the card; no accumulating closures.
    next.addEventListener('click', proceed); stop.addEventListener('click', cancel);
    actions.append(next, stop); root.append(status, label, actions); screen.append(root);
    card = { root, status }; deadline = now() + 5000; tick();
  }
  for (const type of ['play', 'seeking', 'loadstart', 'emptied', 'error']) listen(video, type, cancel);
  listen(doc.defaultView, 'hashchange', cancel);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  listen(doc, 'keydown', event => {
    if (!card || event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.target?.closest?.('.choice-picker, .source-settings, .account-panel, .art-episode-dialog')) return;
    event.preventDefault(); cancel();
  });
  return { start, cancel, destroy() { if (destroyed) return; cancel(); destroyed = true; listeners.splice(0).forEach(remove => remove()); } };
}

export function createPlayerExtras(video, { screen, right, left, before, episodePanel,
  getEpisodeState = () => ({}), onNext, onError = () => {}, onPreviewHide = () => {}, isActive = () => true } = {}) {
  const doc = screen?.ownerDocument;
  if (!video || !doc || !right) return null;
  const listeners = [], nodes = [];
  let destroyed = false, pipBusy = false, pipToken = 0, drawer, opener;
  let originalParent, originalSibling;
  const listen = (node, type, fn, options) => { node.addEventListener(type, fn, options); listeners.push(() => node.removeEventListener(type, fn, options)); };
  const make = (tag, className) => { const node = doc.createElement(tag); node.className = className; return node; };
  const button = (parent, label, html, className = '', track = true) => {
    const node = make('button', 'art-site-button ' + className); node.type = 'button';
    node.setAttribute('aria-label', label); node.title = label; node.innerHTML = html;
    if (parent === right && before?.parentElement === right) parent.insertBefore(node, before);
    else parent.append(node);
    if (track) nodes.push(node); return node;
  };
  const pipSupported = doc.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function';
  let pip;
  if (pipSupported) {
    pip = button(right, '画中画', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 11h6v5h-6z"/></svg>', 'art-site-pip');
    listen(pip, 'click', async () => {
      if (pipBusy || pip.disabled || destroyed) return;
      pipBusy = true; const token = ++pipToken, source = video.currentSrc || video.src;
      refresh();
      try {
        if (doc.pictureInPictureElement === video) await doc.exitPictureInPicture();
        else await video.requestPictureInPicture();
        if ((destroyed || !isActive()) && doc.pictureInPictureElement === video) await doc.exitPictureInPicture();
      } catch (error) {
        if (!destroyed && token === pipToken && source === (video.currentSrc || video.src) && error?.name !== 'AbortError') onError('暂时无法打开画中画，请在画面加载后重试。');
      } finally { if (token === pipToken) { pipBusy = false; refresh(); } }
    });
    for (const type of ['enterpictureinpicture', 'leavepictureinpicture']) listen(video, type, refresh);
  }
  let next, episodes;
  if (left && onNext) {
    next = button(left, '下一集（N）', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 5 9 7-9 7zM18 5v14"/></svg>', 'art-site-next');
    const play = left.querySelector('.art-control-playAndPause');
    if (play) left.insertBefore(next, play.nextSibling);
    listen(next, 'click', () => { if (!next.disabled && !destroyed) onNext(); });
  }
  if (episodePanel) {
    episodes = button(right, '选集与来源', '选集', 'art-site-episodes');
    episodes.setAttribute('aria-expanded', 'false'); episodes.setAttribute('aria-haspopup', 'dialog');
    episodes.setAttribute('aria-controls', 'player-episode-dialog');
    listen(episodes, 'click', () => { if (!episodes.disabled && !destroyed) { if (drawer) close(); else open(); } });
  }
  function close(restoreFocus = true) {
    if (!drawer) return;
    originalParent.insertBefore(episodePanel, originalSibling?.parentElement === originalParent ? originalSibling : null);
    const old = drawer; drawer = null; old.backdrop.remove(); old.dialog.remove(); old.placeholder.remove();
    screen.classList.remove('episode-drawer-open'); episodes.setAttribute('aria-expanded', 'false');
    if (restoreFocus) opener?.focus({ preventScroll: true });
  }
  function open({ sources = false } = {}) {
    if (destroyed || drawer || !episodes || episodes.disabled || !isActive() || !episodePanel?.parentElement) return;
    onPreviewHide(); opener = doc.activeElement?.closest?.('.artplayer-host, .art-player-recovery') ? doc.activeElement : episodes;
    originalParent = episodePanel.parentElement; originalSibling = episodePanel.nextSibling;
    const placeholder = make('div', 'episode-panel art-episode-placeholder'); placeholder.setAttribute('aria-hidden', 'true');
    const placeholderTitle = make('p', 'art-episode-placeholder-title'); placeholderTitle.textContent = '选集已在播放器内打开';
    const placeholderHint = make('p', 'secondary'); placeholderHint.textContent = '选择剧集或关闭面板后，这里会恢复。';
    placeholder.append(placeholderTitle, placeholderHint); originalParent.insertBefore(placeholder, episodePanel);
    const backdrop = make('button', 'art-episode-backdrop'); backdrop.type = 'button'; backdrop.tabIndex = -1;
    backdrop.setAttribute('aria-label', '关闭选集面板');
    const dialog = make('div', 'art-episode-dialog'); dialog.id = 'player-episode-dialog'; dialog.tabIndex = -1;
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', '选集与播放来源');
    const header = make('div', 'art-episode-header'), label = make('span', 'art-episode-title');
    label.textContent = getEpisodeState().label || '选集与来源'; header.append(label);
    const dismiss = button(header, '关闭选集面板', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>', '', false);
    dialog.append(header, episodePanel); screen.append(backdrop, dialog);
    drawer = { dialog, backdrop, label, placeholder }; screen.classList.add('episode-drawer-open'); episodes.setAttribute('aria-expanded', 'true');
    // Short-lived listeners live with the drawer, not the player lifetime.
    backdrop.addEventListener('click', () => close()); dismiss.addEventListener('click', () => close());
    dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, summary, select, a[href], [tabindex]')].filter(node => !node.disabled && !node.hidden && node.tabIndex >= 0 && node.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    if (sources) {
      const choices = episodePanel.querySelector('#watch-sources'); if (choices) choices.open = true;
      (episodePanel.querySelector('#watch-sources-toggle') || dismiss).focus({ preventScroll: true });
    } else {
      dismiss.focus({ preventScroll: true });
      episodePanel.querySelector('#episodes [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
    }
  }
  if (episodePanel) listen(episodePanel, 'click', event => { if (drawer && event.target.closest?.('#episodes [data-index]')) close(); }, { capture: true });
  listen(doc, 'keydown', event => {
    if (event.code !== 'KeyE' || event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !isActive() || !episodes || episodes.disabled) return;
    const target = event.target;
    if (/INPUT|SELECT|TEXTAREA/.test(target?.tagName) || target?.isContentEditable || target?.closest?.('.source-settings, .account-panel, .choice-picker')) return;
    event.preventDefault(); open();
  });
  function refresh() {
    if (destroyed) return;
    const state = getEpisodeState() || {};
    if (next) { next.hidden = (state.count || 0) < 2; next.disabled = !!state.loading || state.current < 0 || state.current + 1 >= state.count; }
    if (episodes) { episodes.disabled = !!state.loading || !(state.count > 0); episodes.textContent = state.count === 1 ? '来源' : '选集'; }
    if (drawer) drawer.label.textContent = state.label || '选集与来源';
    if (pip) {
      const active = doc.pictureInPictureElement === video;
      pip.disabled = pipBusy || video.disablePictureInPicture || (!active && (video.readyState < 2 || !video.videoWidth));
      pip.setAttribute('aria-pressed', String(active)); pip.setAttribute('aria-label', active ? '退出画中画' : '画中画'); pip.title = pip.getAttribute('aria-label');
    }
  }
  for (const type of ['loadedmetadata', 'loadeddata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended']) listen(video, type, refresh);
  for (const type of ['loadstart', 'emptied']) listen(video, type, () => { pipToken++; pipBusy = false; close(); refresh(); });
  listen(doc, 'fullscreenchange', () => { close(); refresh(); });
  listen(doc.defaultView, 'resize', () => close());
  const exitPip = () => {
    if (doc.pictureInPictureElement !== video) return;
    try { doc.exitPictureInPicture()?.catch(() => {}); } catch { /* Browser may already be closing its floating window. */ }
  };
  listen(doc.defaultView, 'hashchange', () => { close(false); if (!isActive()) { pipToken++; pipBusy = false; exitPip(); } refresh(); });
  refresh();
  return { refresh, open, close, destroy() { if (destroyed) return; close(false); destroyed = true; pipToken++; listeners.splice(0).forEach(remove => remove()); nodes.forEach(node => node.remove()); exitPip(); } };
}
