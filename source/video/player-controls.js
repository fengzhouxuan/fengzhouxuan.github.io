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
  const seekPreview = node('seek-preview'), volumeValue = node('volume-value');
  if (!video || !screen || !play || !seek || !time || !mute || !volume || !fullscreen) return null;
  const doc = screen.ownerDocument, listeners = [];
  const nativeControls = video.controls;
  let idleTimer, ratePicker, buffering = false, scrubbing = false, destroyed = false, requestId = 0, lastVolume = video.volume > 0 ? video.volume : 1;
  const listen = (target, event, handler) => { target.addEventListener(event, handler); listeners.push(() => target.removeEventListener(event, handler)); };
  const duration = () => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  function show() {
    clearTimer(idleTimer); screen.classList.remove('controls-idle');
    if (!video.paused && !video.ended && !buffering) idleTimer = setTimer(() => {
      const keyboardFocus = controls.contains(doc.activeElement) && doc.activeElement.matches(':focus-visible');
      if (!destroyed && !video.paused && !buffering && !keyboardFocus && !controls.matches(':hover')) screen.classList.add('controls-idle');
    }, 2500);
  }
  function displayTime(position) {
    const end = duration();
    time.textContent = mediaClock(position) + ' / ' + mediaClock(end || NaN);
    seek.setAttribute('aria-valuetext', time.textContent);
    controls.style.setProperty('--played', (end ? clamp(position / end * 100, 0, 100) : 0) + '%');
  }
  function hidePreview() { if (seekPreview) seekPreview.hidden = true; }
  function previewTime(ratio) {
    const width = seek.getBoundingClientRect?.().width;
    if (!seekPreview || !duration() || !width || !Number.isFinite(ratio)) { hidePreview(); return; }
    ratio = clamp(ratio, 0, 1);
    seekPreview.textContent = mediaClock(ratio * duration());
    const margin = Math.min(32, width / 2);
    seekPreview.style.setProperty('--seek-x', clamp(ratio * width, margin, width - margin) + 'px');
    seekPreview.hidden = false;
  }
  function refresh() {
    if (destroyed) return;
    const end = duration(), paused = video.paused || video.ended;
    screen.classList.toggle('is-playing', !paused);
    screen.classList.toggle('is-buffering', buffering && !paused);
    play.setAttribute('aria-label', paused ? '播放' : '暂停'); play.title = paused ? '播放（空格）' : '暂停（空格）';
    play.disabled = !video.getAttribute('src') && video.readyState === 0;
    seek.disabled = !end;
    if (!end) hidePreview();
    if (!scrubbing) { seek.value = String(end ? clamp(video.currentTime / end * 1000, 0, 1000) : 0); displayTime(Math.max(0, video.currentTime || 0)); }
    let buffered = 0;
    try { for (let index = 0; index < video.buffered.length; index++) if (video.buffered.start(index) <= video.currentTime) buffered = Math.max(buffered, video.buffered.end(index)); } catch { /* A source can replace its buffered ranges while loading. */ }
    controls.style.setProperty('--buffered', (end ? clamp(buffered / end * 100, 0, 100) : 0) + '%');
    const silent = video.muted || video.volume === 0;
    controls.classList.toggle('is-muted', silent); mute.setAttribute('aria-label', silent ? '解除静音' : '静音'); mute.setAttribute('aria-pressed', String(silent));
    volume.value = String(silent ? 0 : Math.round(video.volume * 100)); volume.setAttribute('aria-valuetext', volume.value + '%');
    controls.style.setProperty('--volume', volume.value + '%');
    if (volumeValue) volumeValue.textContent = volume.value + '%';
    if (video.volume > 0) lastVolume = video.volume;
    fullscreen.setAttribute('aria-label', doc.fullscreenElement === screen ? '退出全屏' : '全屏');
    if (rate) { rate.value = String(video.playbackRate || 1); ratePicker?.refresh(); }
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
  listen(seek, 'pointermove', event => {
    const bounds = seek.getBoundingClientRect?.();
    if (!scrubbing && bounds?.width && Number.isFinite(event.clientX) && event.pointerType !== 'touch') previewTime((event.clientX - bounds.left) / bounds.width);
  });
  listen(seek, 'pointerleave', () => { if (!scrubbing) hidePreview(); });
  listen(seek, 'input', () => { scrubbing = true; const ratio = clamp(seek.value, 0, 1000) / 1000; displayTime(ratio * duration()); previewTime(ratio); show(); });
  listen(seek, 'change', () => commitSeek(clamp(seek.value, 0, 1000) / 1000 * duration()));
  listen(seek, 'pointercancel', () => { scrubbing = false; hidePreview(); refresh(); show(); });
  listen(seek, 'blur', () => { scrubbing = false; hidePreview(); refresh(); });
  listen(seek, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !duration()) return;
    const steps = { ArrowLeft: -10, ArrowRight: 10, PageDown: -60, PageUp: 60 };
    if (!Object.hasOwn(steps, event.key) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); commitSeek(event.key === 'Home' ? 0 : event.key === 'End' ? duration() : video.currentTime + steps[event.key]);
    previewTime(video.currentTime / duration());
  });
  listen(mute, 'click', () => { if (video.muted || video.volume === 0) { if (!video.volume) video.volume = lastVolume; video.muted = false; } else video.muted = true; refresh(); show(); });
  listen(volume, 'input', () => { video.volume = clamp(volume.value, 0, 100) / 100; video.muted = video.volume === 0; refresh(); show(); });
  listen(fullscreen, 'click', event => { onFullscreen?.(event); show(); });
  if (rate) listen(rate, 'change', () => {
    const value = Number(rate.value);
    if ([.75, 1, 1.25, 1.5, 2].includes(value)) try { video.playbackRate = value; } catch { onError('暂时无法切换倍速。'); }
    refresh(); show();
  });
  for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'volumechange', 'ratechange', 'error']) listen(video, event, refresh);
  for (const event of ['emptied', 'loadstart']) listen(video, event, () => { scrubbing = false; buffering = false; requestId++; hidePreview(); refresh(); });
  listen(video, 'waiting', () => { buffering = !video.paused && !video.ended; refresh(); show(); });
  for (const event of ['play', 'pause', 'ended', 'playing', 'canplay', 'seeked']) listen(video, event, () => { buffering = false; refresh(); show(); });
  for (const event of ['pointermove', 'pointerleave', 'focusin', 'focusout']) listen(screen, event, show);
  listen(doc, 'fullscreenchange', () => { hidePreview(); refresh(); show(); });
  if (doc.defaultView?.addEventListener) listen(doc.defaultView, 'resize', hidePreview);
  listen(doc, 'keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && doc.fullscreenElement === screen && onFullscreen) { event.preventDefault(); onFullscreen(event); }
  });
  if (rate) ratePicker = createRatePicker(rate, { label: '' });
  refresh(); controls.hidden = false; video.controls = false; screen.classList.add('custom-controls'); show();
  return { refresh, destroy() {
    if (destroyed) return;
    destroyed = true; requestId++; clearTimer(idleTimer); listeners.forEach(remove => remove()); ratePicker?.destroy(); hidePreview();
    controls.hidden = true; video.controls = nativeControls; screen.classList.remove('custom-controls', 'controls-idle', 'is-playing', 'is-buffering');
  } };
}

export function createRatePicker(select, { label = '倍速' } = {}) {
  const root = select?.parentElement, doc = select?.ownerDocument;
  if (!root || !doc?.createElement || !select.options?.length) return null;
  const listeners = [], nativeHidden = select.hidden;
  const make = (tag, className, text) => { const node = doc.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const trigger = make('button', 'choice-trigger'), value = make('strong', 'choice-value');
  trigger.type = 'button'; trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  if (label) trigger.append(make('span', 'choice-label', label));
  trigger.append(value, make('span', 'choice-chevron'));
  const menu = make('div', 'choice-menu'); menu.id = select.id + '-choices'; menu.hidden = true;
  menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', (select.getAttribute('aria-label') || label) + '选项');
  trigger.setAttribute('aria-controls', menu.id);
  const choices = [...select.options].map(option => {
    const choice = make('button', 'choice-item', option.textContent); choice.type = 'button'; choice.tabIndex = -1;
    choice.dataset.value = option.value; choice.setAttribute('role', 'menuitemradio'); menu.append(choice); return choice;
  });
  let destroyed = false;
  const listen = (node, type, handler) => { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); };
  function refresh() {
    if (destroyed) return;
    const selected = choices.find(choice => choice.dataset.value === select.value);
    value.textContent = selected?.textContent || String(select.value);
    trigger.disabled = select.disabled;
    trigger.setAttribute('aria-label', (select.getAttribute('aria-label') || label) + '：' + value.textContent);
    for (const choice of choices) choice.setAttribute('aria-checked', String(choice === selected));
  }
  function close(restore = false) {
    menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (restore) trigger.focus({ preventScroll: true });
  }
  function focusChoice(choice) {
    choice.focus({ preventScroll: true });
    // Reveal only within a bounded menu, without scrolling the watching page.
    if (!(menu.clientHeight > 0 && menu.scrollHeight > menu.clientHeight)) return;
    const bounds = menu.getBoundingClientRect?.(), item = choice.getBoundingClientRect?.();
    if (!bounds || !item) return;
    const top = bounds.top + (menu.clientTop || 0);
    if (item.top < top) menu.scrollTop += item.top - top;
    else if (item.bottom > top + menu.clientHeight) menu.scrollTop += item.bottom - top - menu.clientHeight;
  }
  function open() {
    if (trigger.disabled) return;
    refresh(); menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    menu.classList.remove('align-left');
    const anchor = trigger.getBoundingClientRect?.(), bounds = menu.getBoundingClientRect?.(), height = bounds?.height;
    const viewport = doc.defaultView?.innerHeight;
    menu.classList.toggle('align-left', Boolean(bounds && bounds.left < 8));
    menu.classList.toggle('opens-up', Boolean(anchor && height && viewport && anchor.bottom + height + 7 > viewport && anchor.top >= height + 7));
    focusChoice(choices.find(choice => choice.dataset.value === select.value) || choices[0]);
  }
  listen(trigger, 'click', () => { if (menu.hidden) open(); else close(true); });
  listen(trigger, 'keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
    else if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); close(true); }
  });
  listen(menu, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    const index = Math.max(0, choices.indexOf(doc.activeElement));
    const next = event.key === 'ArrowDown' ? (index + 1) % choices.length : event.key === 'ArrowUp' ? (index + choices.length - 1) % choices.length : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); focusChoice(choices[next]); }
  });
  for (const choice of choices) listen(choice, 'click', () => {
    select.value = choice.dataset.value;
    const ChangeEvent = doc.defaultView?.Event || Event;
    select.dispatchEvent(new ChangeEvent('change', { bubbles: true }));
    refresh(); close(true);
  });
  listen(select, 'change', refresh);
  listen(doc, 'pointerdown', event => { if (!root.contains(event.target)) close(); });
  listen(root, 'focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
  if (doc.defaultView?.addEventListener) listen(doc.defaultView, 'resize', () => close());
  refresh(); select.hidden = true; root.classList.add('choice-picker'); root.append(trigger, menu);
  return { refresh, destroy() {
    if (destroyed) return;
    const focused = root.contains(doc.activeElement);
    destroyed = true; listeners.forEach(remove => remove()); trigger.remove(); menu.remove();
    select.hidden = nativeHidden; root.classList.remove('choice-picker');
    if (focused && !nativeHidden) select.focus({ preventScroll: true });
  } };
}

// Present the existing HLS selection model inside the player. Catalog and media
// requests stay with app.js; this control only changes the original select.
export function createQualityPicker(select, { container, focusTarget, getMenuHeight = () => 360 } = {}) {
  const doc = select?.ownerDocument, parent = select?.parentElement;
  if (!doc || !parent || !container) return null;
  const sibling = select.nextSibling, hidden = select.hidden;
  const badge = doc.createElement('span'); badge.className = 'art-quality-current';
  let picker, key = '', destroyed = false, latest = {};
  select.hidden = true; container.append(select, badge);
  function refresh(summary = latest) {
    if (destroyed) return;
    latest = summary;
    container.style?.setProperty('--player-menu-height', Math.max(80, Number(getMenuHeight()) || 360) + 'px');
    const options = [...select.options];
    const selectable = summary.selectable && !select.disabled && options.length > 1;
    const nextKey = selectable ? JSON.stringify(options.map(option => [option.value, option.textContent])) : '';
    const focused = container.contains(doc.activeElement);
    if (nextKey !== key) {
      picker?.destroy(); picker = null; select.hidden = true; key = nextKey;
      if (selectable) {
        picker = createRatePicker(select, { label: '' });
        const note = doc.createElement('p'); note.className = 'art-quality-note'; note.setAttribute('aria-hidden', 'true');
        container.querySelector('.choice-menu')?.append(note);
      }
      if (focused) (container.querySelector('.choice-trigger') || focusTarget)?.focus({ preventScroll: true });
    }
    badge.hidden = !!picker; badge.textContent = summary.displayLabel || '清晰度';
    badge.title = [summary.currentLabel, summary.note].filter(Boolean).join('；');
    badge.setAttribute('aria-label', badge.title || '正在读取可用清晰度');
    const trigger = container.querySelector('.choice-trigger'), note = container.querySelector('.art-quality-note');
    if (trigger) trigger.title = badge.title;
    if (note) note.textContent = [summary.currentLabel, summary.note].filter(Boolean).join('\n');
    picker?.refresh();
  }
  refresh();
  return { refresh, destroy() {
    if (destroyed) return;
    const focused = container.contains(doc.activeElement);
    destroyed = true; picker?.destroy(); badge.remove();
    parent.insertBefore(select, sibling?.parentElement === parent ? sibling : null); select.hidden = hidden;
    if (focused) focusTarget?.focus({ preventScroll: true });
  } };
}
