// Independent, lazy decoding. No queries, proxy endpoints or playback mutations.
export function previewURL(value, { pageURL, blockedOrigins = [] } = {}) {
  try {
    const url = new URL(value);
    const blocked = [pageURL, ...blockedOrigins].filter(Boolean).map(value => new URL(value, pageURL).origin);
    if (url.protocol !== 'https:' || url.username || url.password || blocked.includes(url.origin) || /(^|\.)workers\.dev$|(^|\.)localhost$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^\[|^0\./i.test(url.hostname)) return '';
    if (/\/(?:api|proxy)(?:\/|$)/i.test(url.pathname)) return '';
    return url.href;
  } catch { return ''; }
}

// HLS manifests, keys and segments all use the same no-redirect, no-credentials
// loader. A playlist cannot redirect preview traffic through the site's Worker.
export function createPreviewLoader({ allowed, fetchImpl, budget, now = () => performance.now() }) {
  return class PreviewLoader {
    constructor() { this.stats = { aborted: false, loaded: 0, total: 0, retry: 0, chunkCount: 0, bwEstimate: 0, loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 } }; }
    load(context, _config, callbacks) {
      this.context = context; this.controller = new AbortController(); this.stats.loading.start = now();
      const run = async () => {
        if (!allowed(context.url) || budget.remaining <= 0) throw Error('Preview unavailable');
        const headers = {};
        if (Number.isFinite(context.rangeEnd)) headers.Range = `bytes=${context.rangeStart || 0}-${context.rangeEnd - 1}`;
        const response = await fetchImpl(context.url, { signal: this.controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers });
        this.stats.loading.first = now(); this.response = response;
        if (!response.ok || (response.url && !allowed(response.url))) throw Error('Preview unavailable');
        const max = Math.min(budget.remaining, 12 * 1024 * 1024);
        if (Number(response.headers.get('content-length')) > max || !response.body) throw Error('Preview budget');
        const reader = response.body.getReader(), chunks = []; let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            budget.remaining -= value.byteLength; size += value.byteLength;
            if (size > max || this.stats.aborted) throw Error('Preview budget');
            chunks.push(value); this.stats.loaded = size; this.stats.chunkCount++;
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        this.stats.loading.end = now(); this.stats.total = size;
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        if (!this.stats.aborted) callbacks.onSuccess({ url: response.url || context.url, data: context.responseType === 'arraybuffer' ? bytes.buffer : new TextDecoder().decode(bytes) }, this.stats, context, response);
      };
      run().catch(() => { if (!this.stats.aborted) callbacks.onError({ code: 0, text: 'Preview unavailable' }, context, this.response, this.stats); });
    }
    abort() { this.stats.aborted = true; this.controller?.abort(); }
    destroy() { this.abort(); }
    getCacheAge() { return null; }
    getResponseHeader(name) { return this.response?.headers.get(name) || null; }
  };
}

export function createFramePreview(main, { getSource = () => '', blockedOrigins = [], onFrame = () => {},
  doc = main?.ownerDocument, Hls = doc?.defaultView?.Hls, fetchImpl = doc?.defaultView?.fetch?.bind(doc.defaultView),
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now } = {}) {
  const cache = new Map(), budget = { remaining: 40 * 1024 * 1024 };
  let source = '', wanted = null, timer, job, lastStart = -Infinity, failures = 0, destroyed = false, waiting = false;
  const allowed = value => previewURL(value, { pageURL: doc?.location?.href, blockedOrigins });
  const listeners = [];
  const listen = (node, type, handler) => { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); };
  function release() {
    if (!job) return;
    const old = job; job = null; clearTimer(old.timeout);
    old.listeners.forEach(remove => remove());
    try { old.hls?.destroy(); } catch { /* Preview cleanup must not interrupt playback. */ }
    try { old.video.pause(); old.video.removeAttribute('src'); old.video.load(); } catch { /* Already detached decoder. */ }
    old.video.remove();
  }
  function hide() { clearTimer(timer); timer = undefined; wanted = null; release(); onFrame(null); }
  function reset() { hide(); source = ''; cache.clear(); failures = 0; waiting = false; budget.remaining = 40 * 1024 * 1024; }
  function ready() {
    if (doc.hidden || waiting || main.seeking || main.readyState < 2) return false;
    if (main.paused) return true;
    if (main.readyState < 3) return false;
    for (let i = 0; i < main.buffered.length; i++) if (main.buffered.start(i) <= main.currentTime && main.buffered.end(i) - main.currentTime >= 8) return true;
    return false;
  }
  function begin(target) {
    timer = undefined;
    if (destroyed || wanted !== target || !ready() || failures >= 2 || budget.remaining <= 0) return;
    lastStart = now();
    let video;
    try {
      video = doc.createElement('video');
      video.className = 'frame-preview-decoder'; video.muted = true; video.volume = 0; video.controls = false;
      video.preload = 'metadata'; video.crossOrigin = 'anonymous'; video.playsInline = true; video.setAttribute('aria-hidden', 'true');
      doc.body.append(video);
    } catch { failures++; onFrame(null); return; }
    const active = { video, listeners: [], hls: null }; job = active;
    const current = () => job === active && wanted === target && !destroyed;
    const fail = () => { if (current()) { failures++; release(); onFrame(null); } };
    const listenFrame = (type, handler) => { video.addEventListener(type, handler); active.listeners.push(() => video.removeEventListener(type, handler)); };
    const capture = () => {
      if (!current() || video.seeking || video.readyState < 2 || Math.abs(video.currentTime - target) > 1 || !video.videoWidth || !ready()) return;
      try {
        const canvas = doc.createElement('canvas'); canvas.width = 192; canvas.height = Math.max(1, Math.round(192 * video.videoHeight / video.videoWidth));
        // Bound allocation for unusual/portrait streams as well.
        canvas.height = Math.min(192, canvas.height);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = { url: canvas.toDataURL('image/jpeg', .7), time: target };
        cache.set(target, frame); if (cache.size > 24) cache.delete(cache.keys().next().value);
        release(); failures = 0; onFrame(frame);
      } catch { fail(); }
    };
    listenFrame('loadedmetadata', () => { if (current()) try { video.currentTime = target; } catch { fail(); } });
    for (const type of ['seeked', 'loadeddata', 'canplay']) listenFrame(type, capture);
    listenFrame('error', fail); active.timeout = setTimer(fail, 8000);
    try {
      // Native MP4 loading follows redirects outside our loader's control.
      // Keep time-only preview for it rather than risk calling a proxy/Worker.
      if (!/\.mp4(?:$|\?)/i.test(source) && Hls?.isSupported() && fetchImpl) {
        const hls = new Hls({ autoStartLoad: false, enableWorker: false, startLevel: 0, startPosition: target,
          maxBufferLength: 2, maxMaxBufferLength: 4, backBufferLength: 0, maxBufferSize: 4 * 1024 * 1024,
          loader: createPreviewLoader({ allowed, fetchImpl, budget }), });
        active.hls = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (current()) { hls.loadLevel = 0; hls.startLoad(target); } });
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
        hls.loadSource(source); hls.attachMedia(video);
      } else fail();
    } catch { fail(); }
  }
  function request(time) {
    if (destroyed) return;
    const url = allowed(getSource());
    if (url !== source) { reset(); source = url; }
    const duration = main.duration;
    if (!source || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(time)) { hide(); return; }
    const target = Math.max(0, Math.min(Math.floor(time / 5) * 5, Math.max(0, duration - .2)));
    if (wanted === target) return;
    clearTimer(timer); release(); wanted = target; onFrame(null);
    const cached = cache.get(target);
    if (cached) { cache.delete(target); cache.set(target, cached); onFrame(cached); return; }
    if (!ready() || failures >= 2 || budget.remaining <= 0) return;
    timer = setTimer(() => begin(target), Math.max(450, 1500 - (now() - lastStart)));
  }
  for (const type of ['loadstart', 'emptied']) listen(main, type, reset);
  listen(main, 'waiting', () => { waiting = true; hide(); });
  for (const type of ['playing', 'canplay']) listen(main, type, () => { waiting = false; });
  listen(main, 'seeking', hide);
  for (const type of ['timeupdate', 'progress']) listen(main, type, () => { if (job && !ready()) hide(); });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) hide(); });
  return { request, hide, reset, destroy() { if (destroyed) return; reset(); destroyed = true; listeners.splice(0).forEach(remove => remove()); } };
}
