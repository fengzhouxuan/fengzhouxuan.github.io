import test from 'node:test';
import assert from 'node:assert/strict';
import { previewURL, createPreviewLoader, createFramePreview } from '../../source/video/frame-preview.js';

const mediaURL = 'https://media.example/film.m3u8';
function fixture({ supported = true } = {}) {
  function node() {
    const listeners = new Map();
    return { listeners, addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }, emit(name) { [...(listeners.get(name) || [])].forEach(fn => fn()); },
      setAttribute() {}, removeAttribute() {}, pause() { this.paused = true; }, load() {}, remove() { this.removed = true; } };
  }
  const doc = node(), main = node(), timers = new Map(), frames = [], videos = [], instances = [];
  let id = 0, clock = 10000, source = mediaURL, drawFails = false;
  Object.assign(main, { readyState: 4, seeking: false, currentTime: 20, duration: 600, paused: false, volume: .7,
    buffered: { length: 1, start: () => 0, end: () => 200 } });
  doc.location = { href: 'https://blog.example/video/' }; doc.body = { append() {} };
  doc.createElement = tag => {
    if (tag === 'canvas') return { getContext: () => ({ drawImage() { if (drawFails) throw Error('CORS'); } }), toDataURL: () => 'data:image/jpeg;base64,frame' };
    const video = node(); Object.assign(video, { currentTime: 0, readyState: 0, seeking: false, videoWidth: 1280, videoHeight: 720 }); videos.push(video); return video;
  };
  class Hls {
    static isSupported() { return supported; }
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    constructor(options) { this.options = options; this.handlers = new Map(); instances.push(this); }
    on(type, fn) { this.handlers.set(type, fn); }
    emit(type, data = {}) { this.handlers.get(type)?.(type, data); }
    loadSource(url) { this.url = url; }
    attachMedia(video) { this.video = video; }
    startLoad(target) { this.started = target; }
    destroy() { this.destroyed = true; }
  }
  const controller = createFramePreview(main, { doc, Hls, getSource: () => source, fetchImpl: async () => {}, onFrame: frame => frames.push(frame),
    now: () => clock, setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id) });
  function run() { const entry = [...timers].find(([, item]) => item.ms < 8000); assert.ok(entry, 'A debounced request exists'); timers.delete(entry[0]); clock += entry[1].ms; entry[1].fn(); }
  function decode(time) { const hls = instances.at(-1), video = videos.at(-1); hls.emit('manifest'); video.emit('loadedmetadata'); assert.equal(video.currentTime, time); video.readyState = 2; video.emit('seeked'); }
  return { main, doc, controller, frames, timers, videos, instances, run, decode, source: value => source = value, drawFail: () => drawFails = true };
}

test('URL guard rejects site APIs, Workers, credentials, private hosts and unsafe protocols', () => {
  const options = { pageURL: 'https://blog.example/video/', blockedOrigins: ['https://api.example'] };
  assert.equal(previewURL(mediaURL, options), mediaURL);
  for (const url of ['relative.m3u8', 'blob:video', 'http://media.example/a', 'https://blog.example/a', 'https://api.example/a', 'https://x.workers.dev/a', 'https://a:secret@media.example/a', 'https://127.0.0.1/a', 'https://10.0.0.2/a', 'https://192.168.0.2/a', 'https://172.20.0.2/a', 'https://[::1]/a', 'https://localhost/a', 'https://media.example/api/video', 'https://media.example/proxy/a']) assert.equal(previewURL(url, options), '', url);
  assert.equal(previewURL(mediaURL, { pageURL: 'invalid' }), '');
});

test('idle and rapid hovers fetch nothing; one independent decoder gets the settled point, bounded cache avoids reloading', () => {
  const p = fixture(); assert.equal(p.videos.length, 0);
  for (const time of [40, 70, 92]) p.controller.request(time);
  assert.equal(p.timers.size, 1); assert.equal(p.videos.length, 0); p.run();
  assert.equal(p.instances.length, 1); assert.equal(p.instances[0].options.autoStartLoad, false); assert.equal(p.instances[0].options.startLevel, 0);
  assert.equal(p.videos[0].muted, true); assert.equal(p.videos[0].volume, 0);
  p.decode(90); assert.deepEqual(p.frames.at(-1), { url: 'data:image/jpeg;base64,frame', time: 90 });
  assert.equal(p.instances[0].destroyed, true); assert.equal(p.videos[0].removed, true);
  assert.deepEqual([p.main.currentTime, p.main.paused, p.main.volume], [20, false, .7]);
  p.controller.hide(); p.controller.request(94); assert.equal(p.timers.size, 0); assert.equal(p.instances.length, 1);
  for (let time = 100; time <= 225; time += 5) { p.controller.request(time); p.run(); p.decode(time); }
  p.controller.request(90); assert.equal(p.timers.size, 1, 'oldest cached frame was evicted');
  p.controller.destroy(); assert.equal(p.timers.size, 0);
});

test('main playback gets priority; hidden page, insufficient buffer, live duration and seeking never start decoding', () => {
  for (const mutate of [p => p.doc.hidden = true, p => p.main.readyState = 1, p => p.main.readyState = 2,
    p => p.main.seeking = true, p => p.main.buffered.end = () => 22, p => p.main.duration = Infinity]) {
    const p = fixture(); mutate(p); p.controller.request(40); assert.equal(p.timers.size, 0); assert.equal(p.videos.length, 0);
  }
  const p = fixture(); p.main.paused = true; p.main.readyState = 2; p.controller.request(50); p.run();
  p.main.emit('waiting'); assert.equal(p.instances[0].destroyed, true); assert.equal(p.frames.at(-1), null);
  p.controller.request(60); assert.equal(p.timers.size, 0); p.controller.hide(); p.main.emit('playing'); p.controller.request(60);
  p.doc.hidden = true; p.doc.emit('visibilitychange'); assert.equal(p.timers.size, 0);
  p.controller.destroy(); p.controller.request(70); assert.equal(p.timers.size, 0);
});

test('source replacement, leave and destroy cancel pending work and suppress late frames', () => {
  const p = fixture(); p.controller.request(50); p.run(); const old = p.instances[0], oldVideo = p.videos[0];
  p.source('https://cdn.example/next.m3u8'); p.controller.request(60); assert.equal(old.destroyed, true);
  oldVideo.currentTime = 50; oldVideo.readyState = 2; oldVideo.emit('seeked'); assert.equal(p.frames.at(-1), null);
  p.run(); assert.equal(p.instances[1].url, 'https://cdn.example/next.m3u8'); p.decode(60);
  p.main.emit('emptied'); p.controller.request(60); assert.equal(p.timers.size, 1, 'source reset cleared the cache');
  p.controller.hide(); assert.equal(p.timers.size, 0);
  p.controller.request(90); p.run(); p.controller.destroy(); assert.equal(p.instances.at(-1).destroyed, true);
  assert.ok([...p.main.listeners.values()].every(items => items.size === 0));
});

test('a dropping playback buffer preempts decoding; unavailable decoders fail quietly', () => {
  const p = fixture(); p.controller.request(80); p.run();
  p.main.buffered.end = () => 24; p.main.emit('timeupdate'); assert.equal(p.instances[0].destroyed, true); assert.equal(p.frames.at(-1), null);
  const broken = fixture(); broken.doc.createElement = () => { throw Error('decoder unavailable'); };
  broken.controller.request(40); broken.run(); assert.equal(broken.frames.at(-1), null); assert.equal(broken.main.currentTime, 20);
  const cleanup = fixture(); cleanup.controller.request(40); cleanup.run();
  cleanup.instances[0].destroy = () => { throw Error('already closed'); }; cleanup.videos[0].load = () => { throw Error('already detached'); };
  cleanup.controller.destroy(); assert.equal(cleanup.videos[0].removed, true);
});

test('CORS, timeout and media failure degrade only the preview and stop repeated probes', () => {
  const p = fixture(); p.drawFail();
  for (const time of [50, 60]) { p.controller.request(time); p.run(); p.decode(time); assert.equal(p.frames.at(-1), null); }
  p.controller.request(70); assert.equal(p.timers.size, 0); assert.equal(p.main.currentTime, 20);
  p.main.emit('loadstart'); p.controller.request(80); p.run(); p.instances.at(-1).emit('error', { fatal: false }); assert.equal(p.timers.size, 1);
  p.instances.at(-1).emit('error', { fatal: true }); assert.equal(p.timers.size, 0);
  p.controller.request(90); p.run(); const timeout = [...p.timers.values()][0]; timeout.fn(); assert.equal(p.frames.at(-1), null);
});

test('unsupported formats, unsafe sources and unavailable HLS have time-only fallback', () => {
  for (const [source, supported] of [['https://media.example/film.mp4', true], [mediaURL, false], ['https://x.workers.dev/proxy', true]]) {
    const p = fixture({ supported }); p.source(source); p.controller.request(50); if (p.timers.size) p.run();
    assert.equal(p.instances.length, 0); assert.equal(p.frames.at(-1), null);
  }
  const p = fixture(); p.controller.request(NaN); assert.equal(p.timers.size, 0);
  p.controller.request(1000); p.run(); p.decode(599.8);
  p.controller.hide(); p.controller.request(-20); p.run(); p.decode(0);
});

async function load({ url = mediaURL, responseType = 'text', response, remaining = 100, rangeEnd, fetchImpl } = {}) {
  const calls = [], budget = { remaining }, outcomes = [];
  const Loader = createPreviewLoader({ allowed: url => previewURL(url, { pageURL: 'https://blog.example' }), budget,
    fetchImpl: fetchImpl || (async (url, options) => { calls.push({ url, options }); return response || new Response('playlist', { headers: { 'cache-control': 'max-age=1' } }); }) });
  const loader = new Loader(); loader.load({ url, responseType, rangeEnd, rangeStart: 2 }, {}, { onSuccess: (...args) => outcomes.push(['success', ...args]), onError: (...args) => outcomes.push(['error', ...args]) });
  await new Promise(resolve => setImmediate(resolve));
  return { loader, calls, outcomes, budget };
}

test('HLS loader omits credentials/referrer and rejects redirects on EVERY playlist/key/segment request', async () => {
  const p = await load(); assert.equal(p.outcomes[0][0], 'success'); assert.equal(p.outcomes[0][1].data, 'playlist');
  assert.deepEqual([p.calls[0].options.redirect, p.calls[0].options.credentials, p.calls[0].options.referrerPolicy], ['error', 'omit', 'no-referrer']);
  assert.equal(p.budget.remaining, 92); assert.equal(p.loader.stats.total, 8); assert.equal(p.loader.getCacheAge(), null);
  assert.equal(p.loader.getResponseHeader('cache-control'), 'max-age=1');
  const range = await load({ responseType: 'arraybuffer', rangeEnd: 10 }); assert.equal(range.calls[0].options.headers.Range, 'bytes=2-9'); assert.ok(range.outcomes[0][1].data instanceof ArrayBuffer);
  for (const url of ['https://x.workers.dev/video', 'https://blog.example/api/a']) { const blocked = await load({ url }); assert.equal(blocked.calls.length, 0); assert.equal(blocked.outcomes[0][0], 'error'); }
  const redirect = await load({ fetchImpl: async (_url, options) => { assert.equal(options.redirect, 'error'); throw Error('redirect'); } }); assert.equal(redirect.outcomes[0][0], 'error');
});

test('HLS loader bounds response and episode bytes; errors and abort never trigger stale success', async () => {
  for (const options of [{ remaining: 0 }, { response: new Response('large', { headers: { 'content-length': '200' } }) },
    { response: new Response('overflow'), remaining: 2 }, { response: new Response(null, { status: 204 }) }, { response: new Response('error', { status: 500 }) }]) {
    const p = await load(options); assert.equal(p.outcomes[0][0], 'error');
  }
  const response = new Response('ok'); Object.defineProperty(response, 'url', { value: 'https://x.workers.dev/key' });
  assert.equal((await load({ response })).outcomes[0][0], 'error');
  let resolve; const p = await load({ fetchImpl: () => new Promise(done => resolve = done) });
  p.loader.abort(); assert.equal(p.loader.stats.aborted, true); resolve(new Response('late')); await new Promise(done => setImmediate(done)); assert.equal(p.outcomes.length, 0);
  p.loader.destroy(); assert.equal(p.loader.getResponseHeader('missing'), null);
});
