import { createRatePicker, createQualityPicker, mediaClock } from './player-controls.js';
import { createFramePreview } from './frame-preview.js';
import { createPlayerExtras, createAutoNext, createPlayerRecovery } from './player-extras.js';

// Keep the site's media element, HLS lifecycle, resume state and error recovery.
// ArtPlayer owns the visual controls only; source URLs remain managed by app.js.
export function createArtPlayer(video, { screen, controls, onFullscreen, onError = () => {}, getPreviewSource, blockedPreviewOrigins = [], isActive = () => true, getEpisodeState, getAutoNext, onNext, Artplayer = screen?.ownerDocument?.defaultView?.Artplayer } = {}) {
  const doc = screen?.ownerDocument;
  if (!video || !doc || !controls || typeof Artplayer !== 'function') return null;
  const parent = video.parentElement, sibling = video.nextSibling, nativeControls = video.controls, className = video.className;
  const volume = video.volume, muted = video.muted, rate = video.playbackRate;
  const host = doc.createElement('div'); host.className = 'artplayer-host';
  const layout = doc.getElementById?.('watch-layout');
  const listeners = [], pickers = [];
  let art, frames, extras, autoNext, quality, recovery, destroyed = false, playToken = 0, clickState;
  let lastVolume = volume > 0 ? volume : 1;
  const listen = (node, type, handler, options) => { node.addEventListener(type, handler, options); listeners.push(() => node.removeEventListener(type, handler, options)); };
  function restore() {
    frames?.destroy();
    extras?.destroy();
    recovery?.destroy();
    autoNext?.destroy();
    quality?.destroy();
    layout?.classList.remove('theater-mode');
    listeners.splice(0).forEach(remove => remove()); pickers.splice(0).forEach(picker => picker?.destroy());
    if (art) art.destroy(false);
    parent.insertBefore(video, sibling?.parentElement === parent ? sibling : null);
    video.className = className; video.controls = nativeControls;
    if (!art) { video.volume = volume; video.muted = muted; video.playbackRate = rate; }
    host.remove(); screen.classList.remove('artplayer-active');
  }
  try {
    parent.insertBefore(host, video);
    Artplayer.CONTEXTMENU = false;
    Artplayer.RECONNECT_TIME_MAX = 0;
    Artplayer.REMOVE_SRC_WHEN_DESTROY = false;
    Artplayer.DBCLICK_FULLSCREEN = false;
    art = new Artplayer({ container: host, proxy: () => video, url: '', lang: 'zh-cn', volume,
      autoplay: false, autoPlayback: false, hotkey: false, mutex: false, gesture: false,
      fullscreen: false, fullscreenWeb: false, playbackRate: false, setting: false,
      screenshot: false, pip: false, autoSize: false, autoMini: false,
      theme: 'var(--accent)', moreVideoAttr: { controls: false, preload: 'metadata', playsInline: true },
      cssVar: { '--art-control-height': '40px', '--art-bottom-gap': '10px', '--art-border-radius': '6px', '--art-font-family': 'inherit' },
    });
    // The site's media error handler already owns retry and cross-source recovery.
    art.off('video:error');
    art.on('video:error', () => { art.loading.show = false; art.controls.show = true; });
    video.volume = volume; video.muted = muted; video.playbackRate = rate;
    const { $controlsRight: right, $progress: progress, $player: player } = art.template;
    const makeButton = (label, html, action) => {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'art-site-button';
      button.setAttribute('aria-label', label); button.title = label; button.innerHTML = html;
      right.append(button); listen(button, 'click', action); return button;
    };
    const rateHost = doc.createElement('div'); rateHost.className = 'art-site-rate';
    const rateSelect = doc.createElement('select'); rateSelect.id = 'art-speed'; rateSelect.setAttribute('aria-label', '播放倍速');
    for (const value of [.75, 1, 1.25, 1.5, 2]) { const option = doc.createElement('option'); option.value = String(value); option.textContent = value + '×'; rateSelect.append(option); }
    rateHost.append(rateSelect); right.append(rateHost); pickers.push(createRatePicker(rateSelect, { label: '' }));
    listen(rateSelect, 'change', () => { try { video.playbackRate = Number(rateSelect.value); } catch { onError('暂时无法切换倍速。'); } });
    const menuHeight = () => Math.max(80, (Number(screen.clientHeight) || 432) - 72);
    const resizeMenus = () => { rateHost.style.setProperty('--player-menu-height', menuHeight() + 'px'); quality?.refresh(); };
    const qualitySelect = doc.getElementById?.('quality-select');
    if (qualitySelect) {
      const qualityHost = doc.createElement('div'); qualityHost.className = 'art-site-rate art-site-quality'; right.append(qualityHost);
      quality = createQualityPicker(qualitySelect, { container: qualityHost, focusTarget: screen, getMenuHeight: menuHeight });
    }
    const full = makeButton('全屏', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg>', event => onFullscreen?.(event));
    let theater;
    const desktop = () => doc.defaultView.matchMedia?.('(min-width:1000px)').matches ?? true;
    function setTheater(enabled) {
      if (!theater) return;
      enabled = enabled && desktop();
      layout.classList.toggle('theater-mode', enabled);
      theater.setAttribute('aria-pressed', String(enabled));
      theater.setAttribute('aria-label', enabled ? '退出剧场模式（T）' : '剧场模式（T）'); theater.title = theater.getAttribute('aria-label');
      hidePreview();
      if (enabled) screen.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    }
    if (layout) {
      theater = makeButton('剧场模式（T）', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 15h10"/></svg>', () => setTheater(theater.getAttribute('aria-pressed') !== 'true'));
      theater.classList.add('art-site-theater'); theater.setAttribute('aria-pressed', 'false');
    }
    const seek = doc.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.step = '1';
    seek.className = 'art-site-seek'; seek.setAttribute('aria-label', '播放进度，左右方向键快进退10秒');
    const preview = doc.createElement('span'); preview.className = 'art-site-time-preview'; preview.hidden = true; preview.setAttribute('aria-hidden', 'true');
    let frameImage, frameCaption;
    if (getPreviewSource) {
      const image = doc.createElement('img'); image.className = 'art-site-frame'; image.hidden = true; image.alt = '';
      const frameTime = doc.createElement('span'); frameTime.className = 'art-site-frame-caption'; frameTime.hidden = true;
      frameTime.setAttribute('aria-hidden', 'true');
      frameImage = image; frameCaption = frameTime;
      progress.append(image, frameTime);
      frames = createFramePreview(video, { getSource: getPreviewSource, blockedOrigins: blockedPreviewOrigins, doc,
        onFrame(frame) {
          image.hidden = !frame; frameTime.hidden = !frame;
          if (frame) { image.src = frame.url; frameTime.textContent = '约 ' + mediaClock(frame.time); }
          else image.removeAttribute('src');
        },
      });
    }
    progress.append(seek, preview);
    let scrubbing = false, cancelledScrub = false;
    const duration = () => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const clamp = (position, max = duration()) => Math.min(max, Math.max(0, Number(position) || 0));
    const hidePreview = () => { preview.hidden = true; frames?.hide(); };
    const episodePanel = doc.getElementById?.('episode-panel');
    extras = createPlayerExtras(video, { screen, right, left: art.template.$controlsLeft, before: full,
      episodePanel, getEpisodeState, onNext, onError, onPreviewHide: () => { hidePreview(); autoNext?.cancel(); }, isActive });
    autoNext = createAutoNext(video, { screen, getEpisodeState, getAutoNext, onNext, isActive });
    recovery = createPlayerRecovery({ screen, feedback: doc.getElementById?.('playback-feedback'), status: doc.getElementById?.('play-status'), notice: doc.getElementById?.('screen-message'), isActive,
      onChooseSource: () => extras?.open({ sources: true }), canChooseSource: () => !!getEpisodeState?.()?.count,
      getContext: () => { const state = getEpisodeState?.() || {}; return state.key + ':' + state.current; } });
    if (episodePanel) for (const type of ['focusin', 'click']) listen(episodePanel, type, () => autoNext?.cancel());
    function showPreview(ratio, requestFrame = true) {
      const width = seek.getBoundingClientRect().width;
      if (!duration() || !width) { hidePreview(); return; }
      ratio = clamp(ratio, 1); preview.textContent = mediaClock(ratio * duration());
      const margin = Math.min(32, width / 2); preview.style.left = Math.max(margin, clamp(ratio * width, width - margin)) + 'px';
      preview.hidden = false;
      if (frameImage) {
        const inset = Math.min(100, width / 2);
        frameImage.style.left = frameCaption.style.left = Math.max(inset, clamp(ratio * width, width - inset)) + 'px';
      }
      if (requestFrame) frames?.request(ratio * duration()); else frames?.hide();
    }
    function refresh() {
      if (destroyed) return;
      extras?.refresh();
      rateSelect.value = String(video.playbackRate); pickers[0]?.refresh();
      player.querySelector('.art-control-playAndPause')?.setAttribute('aria-label', video.paused || video.ended ? '播放' : '暂停');
      full.setAttribute('aria-label', doc.fullscreenElement === screen ? '退出全屏' : '全屏'); full.title = full.getAttribute('aria-label');
      seek.disabled = !duration();
      if (!scrubbing) seek.value = String(duration() ? clamp(video.currentTime) / duration() * 1000 : 0);
      const position = scrubbing ? clamp(Number(seek.value) / 1000, 1) * duration() : clamp(video.currentTime);
      const timeText = mediaClock(position) + ' / ' + mediaClock(duration() || NaN);
      seek.setAttribute('aria-valuetext', (scrubbing ? '松开后跳转到 ' : '') + timeText);
      const clock = player.querySelector('.art-control-time');
      if (clock) {
        clock.setAttribute('data-current-time', mediaClock(position)); clock.title = seek.getAttribute('aria-valuetext');
        clock.textContent = mediaClock(position).padStart(5, '0') + ' / ' + mediaClock(duration() || NaN).padStart(5, '0');
      }
      art.emit('setBar', 'played', duration() ? position / duration() : 0);
      if (video.volume > 0) lastVolume = video.volume;
      const slider = player.querySelector('.art-volume-slider');
      if (slider) {
        const silent = video.muted || video.volume === 0;
        slider.setAttribute('aria-valuenow', String(silent ? 0 : Math.round(video.volume * 100)));
        slider.setAttribute('aria-valuetext', silent ? '已静音，恢复音量 ' + Math.round(lastVolume * 100) + '%' : Math.round(video.volume * 100) + '%');
      }
      if (!duration()) hidePreview();
    }
    function cancelScrub() { cancelledScrub ||= scrubbing; scrubbing = false; hidePreview(); refresh(); }
    function volumeFeedback() {
      refresh();
      if (art.notice) art.notice.show = video.muted || video.volume === 0 ? '已静音' : '音量 ' + Math.round(video.volume * 100) + '%';
    }
    function toggleMute() {
      if (!isActive()) return;
      if (video.muted || video.volume === 0) { if (!video.volume) video.volume = lastVolume; video.muted = false; }
      else video.muted = true;
      volumeFeedback();
    }
    function commit(position, feedback = false) {
      scrubbing = false;
      if (!duration()) { hidePreview(); refresh(); return false; }
      const previous = video.currentTime;
      try { if (Math.abs(clamp(position) - previous) > .001) video.currentTime = clamp(position); } catch { hidePreview(); refresh(); onError('暂时无法跳转，已保留当前播放位置。'); return false; }
      if (feedback && art.notice) {
        const delta = Math.round(video.currentTime - previous);
        art.notice.show = (delta ? (delta > 0 ? '快进 ' : '后退 ') + Math.abs(delta) + ' 秒' : video.currentTime === 0 ? '已到开头' : '已到片尾') + ' · ' + mediaClock(video.currentTime);
      }
      art.controls.show = true;
      refresh();
      return true;
    }
    async function togglePlay() {
      if (destroyed || !isActive()) return;
      const token = ++playToken, source = video.currentSrc || video.src;
      try { if (video.paused) await video.play(); else video.pause(); }
      catch (error) { if (!destroyed && isActive() && token === playToken && source === (video.currentSrc || video.src) && error?.name !== 'AbortError') onError('暂时无法开始播放，请重试或切换来源。'); }
    }
    art.on('click', () => { playToken++; clickState = { paused: video.paused, source: video.currentSrc || video.src, token: playToken }; });
    if (art.template.$state) listen(art.template.$state, 'click', event => { event.preventDefault(); event.stopImmediatePropagation(); togglePlay(); }, { capture: true });
    art.on('dblclick', event => {
      if (!isActive() || (video.readyState || 0) < 2) return;
      // ArtPlayer toggles playback on the first click. A double-click should
      // change the site's fullscreen target while retaining the original state.
      if (clickState?.token === playToken && clickState.source === (video.currentSrc || video.src)) {
        if (clickState.paused && !video.paused) video.pause();
        else if (!clickState.paused && video.paused) togglePlay();
      }
      onFullscreen?.(event); clickState = null;
    });
    // Preserve range keyboard access and seek only on release, not on hover.
    for (const type of ['mousedown', 'touchstart', 'click']) listen(seek, type, event => event.stopPropagation());
    listen(seek, 'input', () => { cancelledScrub = false; scrubbing = true; showPreview(Number(seek.value) / 1000); art.emit('setBar', 'played', clamp(Number(seek.value) / 1000, 1)); refresh(); art.controls.show = true; });
    listen(seek, 'change', () => {
      if (cancelledScrub) { cancelledScrub = false; cancelScrub(); return; }
      commit(Number(seek.value) / 1000 * duration());
    });
    listen(seek, 'pointermove', event => { if (!scrubbing && event.pointerType !== 'touch') { const bounds = seek.getBoundingClientRect(); showPreview((event.clientX - bounds.left) / bounds.width); } });
    listen(seek, 'pointerleave', () => { if (!scrubbing) hidePreview(); });
    for (const type of ['blur', 'pointercancel']) listen(seek, type, cancelScrub);
    listen(seek, 'keydown', event => {
      if (event.key === 'Escape' && scrubbing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing) { event.preventDefault(); event.stopPropagation(); cancelScrub(); return; }
      if (!duration() || event.altKey || event.ctrlKey || event.metaKey) return;
      const steps = { ArrowLeft: -10, ArrowRight: 10, PageDown: -60, PageUp: 60 };
      if (!Object.hasOwn(steps, event.key) && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); commit(event.key === 'Home' ? 0 : event.key === 'End' ? duration() : video.currentTime + steps[event.key], true); showPreview(video.currentTime / duration(), false);
    });
    // ArtPlayer's default icon controls are divs. Make their actions keyboard accessible.
    for (const [selector, label] of [['.art-control-playAndPause', '播放 / 暂停'], ['.art-icon-volume', '静音'], ['.art-icon-volumeClose', '解除静音']]) {
      const button = player.querySelector(selector); if (!button) continue;
      button.tabIndex = 0; button.setAttribute('role', 'button'); button.setAttribute('aria-label', label);
      listen(button, 'keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.repeat) return;
        if (selector === '.art-control-playAndPause') {
          togglePlay();
        } else toggleMute();
      });
      if (selector === '.art-control-playAndPause') {
        listen(button, 'click', event => { event.preventDefault(); event.stopImmediatePropagation(); togglePlay(); }, { capture: true });
      } else {
        button.title = label + '（M）';
        listen(button, 'click', event => { event.preventDefault(); event.stopImmediatePropagation(); toggleMute(); }, { capture: true });
      }
    }
    const volumeSlider = player.querySelector('.art-volume-slider');
    if (volumeSlider) {
      volumeSlider.tabIndex = 0; volumeSlider.setAttribute('role', 'slider'); volumeSlider.setAttribute('aria-label', '音量'); volumeSlider.setAttribute('aria-valuemin', '0'); volumeSlider.setAttribute('aria-valuemax', '100');
      listen(volumeSlider, 'keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        video.volume = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : clamp(video.volume + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -.05 : .05), 1);
        video.muted = video.volume === 0; volumeFeedback();
      });
    }
    for (const type of ['timeupdate', 'loadedmetadata', 'durationchange', 'ratechange', 'volumechange', 'play', 'pause', 'ended']) listen(video, type, refresh);
    for (const type of ['loadstart', 'emptied']) listen(video, type, () => { playToken++; cancelScrub(); });
    listen(doc, 'fullscreenchange', () => { cancelScrub(); resizeMenus(); });
    listen(doc.defaultView, 'resize', () => { cancelScrub(); resizeMenus(); });
    listen(doc.defaultView, 'blur', cancelScrub);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) cancelScrub(); });
    for (const type of ['loadedmetadata', 'resize']) listen(video, type, resizeMenus);
    listen(doc.defaultView, 'resize', () => { if (!desktop()) setTheater(false); });
    listen(player, 'focusin', () => { art.controls.show = true; });
    listen(video, 'waiting', () => { art.controls.show = true; });
    listen(doc, 'keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.ctrlKey || !isActive()) return;
      if (event.repeat && ['KeyT', 'KeyM'].includes(event.code)) return;
      const target = event.target;
      if (/INPUT|SELECT|TEXTAREA/.test(target?.tagName) || target?.isContentEditable || target?.closest?.('.choice-picker, .source-settings, .account-panel')) return;
      if (event.key === 'Escape' && doc.fullscreenElement === screen) { event.preventDefault(); onFullscreen?.(event); }
      else if (event.key === 'Escape' && theater?.getAttribute('aria-pressed') === 'true') { event.preventDefault(); setTheater(false); }
      else if (event.code === 'KeyT' && theater && desktop() && doc.fullscreenElement !== screen) { event.preventDefault(); setTheater(theater.getAttribute('aria-pressed') !== 'true'); }
      else if (event.code === 'KeyM' || (['ArrowUp', 'ArrowDown'].includes(event.key) && player.contains?.(target))) {
        event.preventDefault();
        if (event.code === 'KeyM') toggleMute();
        else { video.volume = clamp(video.volume + (event.key === 'ArrowUp' ? .05 : -.05), 1); video.muted = video.volume === 0; volumeFeedback(); }
      }
    });
    screen.classList.add('artplayer-active'); controls.hidden = true; refresh(); resizeMenus();
    return { art, refresh, togglePlay, refreshQuality(summary) { quality?.refresh(summary); }, finish() { autoNext?.start(); },
      seekBy(delta) { if (destroyed || !isActive() || !Number.isFinite(delta) || !duration()) return false; commit(video.currentTime + delta, true); return true; },
      destroy() { if (destroyed) return; destroyed = true; restore(); } };
  } catch { restore(); onError('增强播放器暂时无法加载，已使用备用播放器。'); return null; }
}
