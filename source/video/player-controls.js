const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function mediaClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds), hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60, rest = String(total % 60).padStart(2, '0');
  return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + rest : minutes + ':' + rest;
}

export function createPlayerControls(video, { screen, controls, onFullscreen, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const node = name => controls?.querySelector('[data-player="' + name + '"]');
  const play = node('play'), seek = node('seek'), time = node('time'), mute = node('mute'), volume = node('volume'), fullscreen = node('fullscreen'), rate = node('rate');
  if (!video || !screen || !play || !seek || !time || !mute || !volume || !fullscreen) return null;
  const doc = screen.ownerDocument, listeners = [];
  const nativeControls = video.controls;
  let idleTimer, scrubbing = false, destroyed = false, requestId = 0, lastVolume = video.volume > 0 ? video.volume : 1;
  const listen = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); };
  const duration = () => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  function show() {
    clearTimer(idleTimer); screen.classList.remove('controls-idle');
    if (!video.paused && !video.ended) idleTimer = setTimer(() => {
      const keyboardFocus = controls.contains(doc.activeElement) && doc.activeElement.matches(':focus-visible');
      if (!destroyed && !video.paused && !keyboardFocus && !controls.matches(':hover')) screen.classList.add('controls-idle');
    }, 2500);
  }
  function displayTime(position) {
    const end = duration();
    time.textContent = mediaClock(position) + ' / ' + mediaClock(end || NaN);
    seek.setAttribute('aria-valuetext', time.textContent);
    controls.style.setProperty('--played', (end ? clamp(position / end * 100, 0, 100) : 0) + '%');
  }
  function refresh() {
    if (destroyed) return;
    const end = duration(), paused = video.paused || video.ended;
    screen.classList.toggle('is-playing', !paused);
    play.setAttribute('aria-label', paused ? '播放' : '暂停'); play.title = paused ? '播放（空格）' : '暂停（空格）';
    play.disabled = !video.getAttribute('src') && video.readyState === 0;
    seek.disabled = !end;
    if (!scrubbing) { seek.value = String(end ? clamp(video.currentTime / end * 1000, 0, 1000) : 0); displayTime(Math.max(0, video.currentTime || 0)); }
    let buffered = 0;
    try { for (let index = 0; index < video.buffered.length; index++) if (video.buffered.start(index) <= video.currentTime) buffered = Math.max(buffered, video.buffered.end(index)); } catch { /* A source can replace its buffered ranges while loading. */ }
    controls.style.setProperty('--buffered', (end ? clamp(buffered / end * 100, 0, 100) : 0) + '%');
    const silent = video.muted || video.volume === 0;
    controls.classList.toggle('is-muted', silent); mute.setAttribute('aria-label', silent ? '解除静音' : '静音'); mute.setAttribute('aria-pressed', String(silent));
    volume.value = String(silent ? 0 : Math.round(video.volume * 100)); volume.setAttribute('aria-valuetext', volume.value + '%');
    if (video.volume > 0) lastVolume = video.volume;
    fullscreen.setAttribute('aria-label', doc.fullscreenElement === screen ? '退出全屏' : '全屏');
    if (rate) rate.value = String(video.playbackRate || 1);
    if (paused) show();
  }
  async function togglePlay() {
    show(); const token = ++requestId, source = video.currentSrc || video.getAttribute('src');
    try { if (video.paused || video.ended) await video.play(); else video.pause(); }
    catch (error) { if (!destroyed && token === requestId && source === (video.currentSrc || video.getAttribute('src')) && error?.name !== 'AbortError') onError('暂时无法开始播放，请重试或切换来源。'); }
    refresh();
  }
  function commitSeek(position) {
    scrubbing = false;
    if (duration()) try { video.currentTime = clamp(position, 0, duration()); } catch { onError('暂时无法跳转，已保留当前播放位置。'); }
    refresh(); show();
  }
  listen(play, 'click', togglePlay);
  listen(video, 'click', () => { if (!play.disabled) togglePlay(); });
  listen(seek, 'input', () => { scrubbing = true; displayTime(clamp(seek.value, 0, 1000) / 1000 * duration()); show(); });
  listen(seek, 'change', () => commitSeek(clamp(seek.value, 0, 1000) / 1000 * duration()));
  listen(seek, 'pointercancel', () => { scrubbing = false; refresh(); show(); });
  listen(seek, 'blur', () => { scrubbing = false; refresh(); });
  listen(seek, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !duration()) return;
    const steps = { ArrowLeft: -10, ArrowRight: 10, PageDown: -60, PageUp: 60 };
    if (!Object.hasOwn(steps, event.key) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); commitSeek(event.key === 'Home' ? 0 : event.key === 'End' ? duration() : video.currentTime + steps[event.key]);
  });
  listen(mute, 'click', () => { if (video.muted || video.volume === 0) { if (!video.volume) video.volume = lastVolume; video.muted = false; } else video.muted = true; refresh(); show(); });
  listen(volume, 'input', () => { video.volume = clamp(volume.value, 0, 100) / 100; video.muted = video.volume === 0; refresh(); show(); });
  listen(fullscreen, 'click', event => { onFullscreen?.(event); show(); });
  if (rate) listen(rate, 'change', () => {
    const value = Number(rate.value);
    if ([.75, 1, 1.25, 1.5, 2].includes(value)) try { video.playbackRate = value; } catch { onError('暂时无法切换倍速。'); }
    refresh(); show();
  });
  for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'volumechange', 'ratechange', 'seeked', 'error']) listen(video, event, refresh);
  for (const event of ['emptied', 'loadstart']) listen(video, event, () => { scrubbing = false; requestId++; refresh(); });
  for (const event of ['play', 'pause', 'ended']) listen(video, event, () => { refresh(); show(); });
  for (const event of ['pointermove', 'pointerleave', 'focusin', 'focusout']) listen(screen, event, show);
  listen(doc, 'fullscreenchange', () => { refresh(); show(); });
  refresh(); controls.hidden = false; video.controls = false; screen.classList.add('custom-controls'); show();
  return { refresh, destroy() {
    if (destroyed) return;
    destroyed = true; requestId++; clearTimer(idleTimer); listeners.forEach(remove => remove());
    controls.hidden = true; video.controls = nativeControls; screen.classList.remove('custom-controls', 'controls-idle', 'is-playing');
  } };
}
