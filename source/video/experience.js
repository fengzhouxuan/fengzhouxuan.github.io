import { SOURCES, plainText } from './core.js';
import { matchingEpisode } from './playback.js';

const storageKey = 'video-playback-experience';
const suspended = new Set(['paused', 'blocked', 'offline', 'background', 'seeking', 'seek-timeout', 'idle', 'ended']);
const phases = new Set(['loading', 'playing', 'buffering', 'recovering', 'failed', ...suspended]);
const validKey = key => typeof key === 'string' && key.length <= 100 && SOURCES.some(source => key.startsWith(source.id + '|')) && !/[:<>?#]|\/\//.test(key) && key.split('|').length === 2 && Boolean(key.split('|')[1]);

export function createSourceHealth({ storage = null, now = () => Date.now(), lifetime = 86400000 } = {}) {
  if (typeof now !== 'function' || !Number.isFinite(lifetime) || lifetime <= 0) throw new Error('来源记录配置不正确');
  const key = 'video-source-health'; const operations = ['search', 'browse', 'detail'];
  const valid = (source, operation) => SOURCES.some(item => item.id === source) && operations.includes(operation);
  const identity = value => value.source + '|' + value.operation;
  let records = []; let previousRaw; const pending = new Map();

  function refresh() {
    try {
      const raw = storage?.getItem(key);
      if (raw !== previousRaw) {
        previousRaw = raw;
        let saved; try { saved = JSON.parse(raw || '[]'); } catch { saved = []; }
        records = Array.isArray(saved) ? saved.slice(0, 100).filter(value => value && valid(value.source, value.operation)
          && ['updatedAt', 'startedAt', 'retryAt'].every(field => Number.isFinite(value[field]) && value[field] >= 0)
          && value.startedAt <= value.updatedAt && value.retryAt <= value.updatedAt + 300000
          && Number.isInteger(value.failures) && value.failures >= 0 && value.failures <= 5
          && (value.latencyMs === null || Number.isFinite(value.latencyMs) && value.latencyMs >= 0 && value.latencyMs <= 120000))
          .map(({ source, operation, updatedAt, startedAt, retryAt, failures, latencyMs }) => ({ source, operation, updatedAt, startedAt, retryAt, failures, latencyMs })) : [];
      }
    } catch { /* Local query observations are optional. */ }
    const time = now();
    records = [...new Map(records.filter(value => value.updatedAt <= time && time - value.updatedAt <= lifetime)
      .sort((a, b) => a.updatedAt - b.updatedAt).map(value => [identity(value), value])).values()];
  }

  function profile(source, operation) {
    refresh();
    const record = records.find(value => value.source === source && value.operation === operation);
    const cooldownMs = record ? Math.max(0, record.retryAt - now()) : 0;
    return { observed: Boolean(record), latencyMs: record?.latencyMs ?? null, failures: record?.failures || 0,
      retryAt: record?.retryAt || 0, cooldownMs, score: (record?.latencyMs ?? 4000) + (record?.failures || 0) * 20000 };
  }

  function begin(source, operation) {
    if (!valid(source, operation)) return null;
    const ticket = { source, operation, startedAt: now() };
    pending.set(identity(ticket), ticket); return ticket;
  }

  function finish(ticket, { successful, elapsedMs, ignored = false } = {}) {
    if (!ticket || pending.get(identity(ticket)) !== ticket) return false;
    pending.delete(identity(ticket));
    if (ignored || typeof successful !== 'boolean' || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 120000) return false;
    refresh(); const time = now();
    const previous = records.find(value => identity(value) === identity(ticket));
    if (ticket.startedAt > time || previous && previous.startedAt > ticket.startedAt) return false;
    const failures = successful ? 0 : Math.min(5, (previous?.failures || 0) + 1);
    const value = { source: ticket.source, operation: ticket.operation, startedAt: ticket.startedAt, updatedAt: time, failures,
      latencyMs: successful ? Math.round(previous?.latencyMs == null ? elapsedMs : previous.latencyMs * 0.4 + elapsedMs * 0.6) : previous?.latencyMs ?? null,
      retryAt: successful ? 0 : time + Math.min(300000, 60000 * 2 ** (failures - 1)) };
    records = records.filter(record => identity(record) !== identity(ticket)); records.push(value);
    const raw = JSON.stringify(records);
    try { if (storage) { storage.setItem(key, raw); previousRaw = raw; } } catch { /* Keep the current-tab observation when storage is unavailable. */ }
    return true;
  }

  function order(sources, operation, { retry = false } = {}) {
    if (!Array.isArray(sources) || !operations.includes(operation)) throw new Error('来源查询范围不正确');
    return [...new Set(sources)].filter(source => valid(source, operation)).map(source => ({ source, ...profile(source, operation) }))
      .filter(value => retry || !value.cooldownMs).sort((a, b) => a.score - b.score).map(value => value.source);
  }

  function clear() { records = []; pending.clear(); try { storage?.removeItem(key); previousRaw = null; } catch {} }
  refresh();
  return { profile, begin, finish, order, clear };
}

export function playbackLineKey(item, line) {
  const name = plainText(item?.lines?.[line]?.name).slice(0, 80);
  const key = item?.source + '|' + name;
  return validKey(key) ? key : '';
}

export function createPlaybackExperience({ storage = null, now = () => performance.now(), wallNow = () => Date.now(), maximum = 60, lifetime = 86400000 } = {}) {
  if (typeof now !== 'function' || typeof wallNow !== 'function' || !Number.isInteger(maximum) || maximum < 1 || maximum > 200 || !Number.isFinite(lifetime) || lifetime <= 0) throw new Error('播放体验配置不正确');
  const state = { active: false, phase: 'idle', firstFrameMs: null, evidence: '', watchMs: 0, bufferMs: 0, buffers: 0, attempts: 0, recoveryMs: null };
  let records = []; let attempt = null; let previous = now(); let previousPosition = null; let startupMs = 0; let recoveryWait = 0;

  function prune() {
    const time = wallNow();
    records = records.filter(record => record.updatedAt <= time && time - record.updatedAt <= lifetime).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maximum);
  }

  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) records = saved.slice(0, 200).filter(record => validKey(record?.key) && Number.isFinite(record.updatedAt) && record.updatedAt > 0 && Array.isArray(record.samples)).map(record => ({
      key: record.key, updatedAt: record.updatedAt,
      samples: record.samples.slice(-5).filter(sample => sample && (sample.firstFrameMs === null || (Number.isFinite(sample.firstFrameMs) && sample.firstFrameMs >= 0 && sample.firstFrameMs <= 120000)) && (sample.firstFrameMs !== null || sample.failed === true) && ['watchMs', 'bufferMs', 'buffers'].every(key => Number.isFinite(sample[key]) && sample[key] >= 0 && sample[key] <= 86400000) && typeof sample.failed === 'boolean').map(sample => ({ firstFrameMs: sample.firstFrameMs, watchMs: sample.watchMs, bufferMs: sample.bufferMs, buffers: sample.buffers, failed: sample.failed })),
    })).filter(record => record.samples.length);
  } catch { records = []; }
  prune();

  function sync() {
    if (!attempt?.key || (attempt.firstFrameMs === null && !attempt.failed)) return;
    prune();
    let record = records.find(value => value.key === attempt.key);
    if (!record) { record = { key: attempt.key, updatedAt: wallNow(), samples: [] }; records.unshift(record); }
    if (!record.samples.includes(attempt.sample)) { attempt.sample = {}; record.samples.push(attempt.sample); record.samples = record.samples.slice(-5); }
    Object.assign(attempt.sample, { firstFrameMs: attempt.firstFrameMs, watchMs: Math.round(attempt.watchMs), bufferMs: Math.round(attempt.bufferMs), buffers: attempt.buffers, failed: attempt.failed });
    record.updatedAt = wallNow(); prune();
    try { storage?.setItem(storageKey, JSON.stringify(records)); } catch { /* Optional local observations must not interrupt watching. */ }
  }

  function observe(phase = state.phase, sample) {
    const time = now(); const elapsed = Math.max(0, time - previous); previous = time;
    const position = Number.isFinite(sample?.position) && sample.position >= 0 ? sample.position : null;
    const rate = Number.isFinite(sample?.rate) && sample.rate > 0 ? sample.rate : 1;
    const progressMs = position !== null && previousPosition !== null && !sample.seeking ? Math.min(elapsed, Math.max(0, position - previousPosition) * 1000 / rate) : position !== null || previousPosition !== null ? 0 : elapsed;
    if (position !== null) previousPosition = position;
    if (!state.active) return state;
    if (!suspended.has(state.phase) && state.phase !== 'failed') {
      if (!attempt || attempt.firstFrameMs === null) {
        startupMs += elapsed;
        if (attempt) attempt.startupMs += elapsed;
        if (state.firstFrameMs !== null) recoveryWait += elapsed;
      } else if (state.phase === 'buffering') {
        state.bufferMs += elapsed; attempt.bufferMs += elapsed;
      } else if (state.phase === 'playing') {
        state.watchMs += progressMs; attempt.watchMs += progressMs;
      }
    }
    const next = phases.has(phase) ? phase : 'idle';
    if (next === 'buffering' && state.phase !== 'buffering' && attempt && attempt.firstFrameMs !== null) { state.buffers++; attempt.buffers++; }
    state.phase = next;
    return state;
  }

  function checkpoint() { observe(); sync(); }
  function finish() { checkpoint(); state.active = false; state.phase = 'idle'; attempt = null; }

  function wait(phase = 'loading') { finish(); state.active = true; state.phase = phases.has(phase) ? phase : 'loading'; previous = now(); }

  function open(phase = 'loading') {
    finish();
    Object.assign(state, { active: true, phase: phases.has(phase) ? phase : 'loading', firstFrameMs: null, evidence: '', watchMs: 0, bufferMs: 0, buffers: 0, attempts: 0, recoveryMs: null });
    startupMs = 0; recoveryWait = 0; previous = now();
  }

  function begin(item, line, continued = false) {
    if (!continued) open(); else { observe(); sync(); state.active = true; state.phase = 'loading'; }
    attempt = { key: playbackLineKey(item, line), firstFrameMs: null, startupMs: 0, watchMs: 0, bufferMs: 0, buffers: 0, failed: false, sample: null };
    previousPosition = null;
    state.attempts++; previous = now();
  }

  function frame(evidence = 'frame') {
    if (!state.active || !attempt || attempt.firstFrameMs !== null || suspended.has(state.phase) || state.phase === 'failed' || !['frame', 'playing'].includes(evidence)) return false;
    observe(); attempt.firstFrameMs = Math.round(attempt.startupMs);
    if (state.firstFrameMs === null) { state.firstFrameMs = Math.round(startupMs); state.evidence = evidence; }
    else { state.recoveryMs = Math.round(recoveryWait); recoveryWait = 0; }
    state.phase = 'playing'; sync(); return true;
  }

  function fail() {
    if (!state.active || !attempt || suspended.has(state.phase)) return;
    observe(); attempt.failed = true; state.phase = 'failed'; sync();
  }

  function profile(item, line) {
    prune();
    const samples = records.find(record => record.key === playbackLineKey(item, line))?.samples || [];
    let weight = 0; let failures = 0; let frames = 0; let latency = 0; let watch = 0; let buffer = 0;
    samples.forEach((sample, index) => {
      const value = 0.6 ** (samples.length - index - 1); weight += value; failures += Number(sample.failed) * value;
      if (sample.firstFrameMs !== null) { frames += value; latency += sample.firstFrameMs * value; }
      watch += sample.watchMs * value; buffer += sample.bufferMs * value;
    });
    const failureRate = weight ? failures / weight : 0;
    const frameMs = frames ? latency / frames : null;
    const bufferRate = watch + buffer > 0 ? buffer / (watch + buffer) : 0;
    const score = weight ? failureRate * 30000 + (frameMs ?? 8000) + bufferRate * 60000 : 8000;
    const label = !weight ? '' : failureRate >= 0.5 ? '近期失败较多' : bufferRate > 0.05 && watch + buffer >= 10000 ? '近期缓冲较多' : frames && watch >= 10000 && failureRate === 0 ? '近期较顺畅' : '有起播记录';
    return { score, frameMs, failureRate, bufferRate, samples: samples.length, label };
  }

  function priority(item, line) {
    if (line !== undefined && line !== null) return profile(item, line).score;
    const scores = (item.lines || []).map((_, index) => profile(item, index).score);
    return scores.length ? Math.min(...scores) : 8000;
  }

  function chooseLine(item, name = '') {
    const movie = /电影|片$/.test(item.category || '');
    const lines = (item.lines || []).map((value, line) => ({ line, matched: !name || matchingEpisode(value.episodes, name, movie) >= 0, score: priority(item, line) }));
    return lines.filter(value => value.matched).sort((a, b) => a.score - b.score)[0]?.line ?? 0;
  }

  function startupTimeout(item, line, hasAlternative = false) {
    const value = profile(item, line);
    if (!value.samples) return hasAlternative ? 8000 : 15000;
    if (hasAlternative && value.failureRate >= 0.5) return 6000;
    return Math.min(20000, Math.max(value.failureRate >= 0.5 ? 10000 : 8000, (value.frameMs ?? 3500) * 2 + 3000));
  }

  function clear() { records = []; if (attempt) attempt.key = ''; try { storage?.removeItem(storageKey); } catch {} }
  return { state, open, begin, observe, frame, fail, checkpoint, finish, wait, profile, priority, chooseLine, startupTimeout, clear };
}
