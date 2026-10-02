import { SOURCES, episodeNumber, plainText, validVideoId, videoKey, groupVideos } from './core.js';

export function screenPresentation(width, height, mode = 'auto') {
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const nativePortrait = valid && height > width;
  const portrait = mode === 'portrait' || (mode !== 'wide' && nativePortrait);
  const ratio = portrait && nativePortrait ? width / height : portrait ? 9 / 16 : 16 / 9;
  return { portrait, ratio };
}

export function playbackSummary(item, line = 0) {
  const episodes = item?.lines?.[line]?.episodes || [];
  const count = episodes.length;
  const short = /短剧|漫剧/.test(item?.category || '');
  const movie = /电影|片$/.test(item?.category || '');
  const marker = count === 1 ? plainText(episodes[0].name) + ' ' + plainText(item?.remarks) : '';
  const compilation = !movie && /全集|合集|完整版|全剧集/.test(marker) && !/预告|花絮|片段|试看/.test(marker);
  let kind = 'episodes'; let label = count + ' 集'; let note = '';
  if (compilation) {
    kind = 'compilation'; label = '整部合集'; note = '此来源将内容合并为一条视频，可在播放器内拖动进度。';
  } else if ((short || movie) && count === 1) {
    kind = 'single'; label = movie ? '单部影片' : '单条视频';
    if (short) note = '此来源仅提供一条视频，未说明是否为整部合集。';
  }
  return { kind, count, label, note, names: episodes.map(episode => kind === 'episodes' ? episode.name : label) };
}

export function resumePosition(position, duration, automatic = false) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || position <= 0 || duration <= 0) return 0;
  const target = !automatic && position >= duration - 15 ? 0 : position;
  return Math.min(target, Math.max(0, duration - 1));
}

export function createPlaybackMonitor({ now = () => performance.now(), startupAfter = 20000, stallAfter = 12000, noticeAfter = 1500, seekAfter = 20000 } = {}) {
  if (typeof now !== 'function' || ![startupAfter, stallAfter, noticeAfter, seekAfter].every(value => Number.isFinite(value) && value > 0) || noticeAfter >= stallAfter) throw new Error('播放监测参数不正确');
  const state = { active: false, phase: 'idle', started: false, recovered: false, position: 0, reason: '', waitMs: 0 };
  let lastProgress = 0; let previousPosition = 0; let gate = ''; let seekSince = null;
  let wasOffline = false; let reconnectNeeded = false; let failure = ''; let actioned = false;
  let startupLimit = startupAfter;

  function begin({ position = 0, recovered = false, startupTimeout = startupAfter } = {}) {
    if (!Number.isFinite(startupTimeout) || startupTimeout <= 0) throw new Error('起播等待时间不正确');
    startupLimit = startupTimeout;
    Object.assign(state, { active: true, phase: 'loading', started: false, recovered: Boolean(recovered), position: Number.isFinite(position) && position >= 0 ? position : 0, reason: '', waitMs: 0 });
    previousPosition = state.position; lastProgress = now(); gate = ''; seekSince = null;
    wasOffline = false; reconnectNeeded = false; failure = ''; actioned = false;
  }

  function stop() { state.active = false; state.phase = 'idle'; actioned = true; }
  function fail(reason = '视频线路发生错误') { if (state.active) state.reason = failure = plainText(reason).slice(0, 120); }

  function check(sample = {}) {
    const result = (action = '') => ({ ...state, action });
    if (!state.active || actioned) return result();
    const time = now();
    const position = Number.isFinite(sample.position) && sample.position >= 0 ? sample.position : state.position;
    const advanced = !sample.seeking && !sample.resumeSeeking && !sample.paused && position > previousPosition + 0.05;
    previousPosition = position;
    // A reload reports zero before metadata; retain the intended resume position until then.
    if (position > 0 || state.started) state.position = position;
    if (sample.playing || advanced) { state.started = true; lastProgress = time; }
    if (sample.offline) { wasOffline = true; reconnectNeeded ||= Boolean(failure || sample.error || sample.ready < 3); }
    const suspend = phase => { gate = phase; lastProgress = time; state.waitMs = 0; state.phase = phase; return result(); };
    if (sample.hidden) return suspend('background');
    if (sample.offline) return suspend('offline');
    if (sample.blocked) return suspend('blocked');
    if (sample.ended) { state.active = false; state.phase = 'ended'; return result(); }
    if (sample.userPaused || (state.started && sample.paused && !sample.error && !failure)) return suspend('paused');
    if (sample.seeking) {
      seekSince ??= time;
      return suspend(time - seekSince >= seekAfter ? 'seek-timeout' : 'seeking');
    }
    seekSince = null;
    if (gate) { lastProgress = time; gate = ''; }
    const act = (action, reason) => {
      actioned = true; state.phase = action === 'recover' ? 'recovering' : 'failed'; state.reason = reason;
      if (action === 'recover') state.recovered = true;
      return result(action);
    };
    if (wasOffline) {
      wasOffline = false;
      if (reconnectNeeded && !advanced) return act(sample.automatic === false ? 'fail' : 'recover', '网络已恢复，正在重试当前线路');
      reconnectNeeded = false;
    }
    if (failure || sample.error) return act('fail', failure || '视频线路发生错误');
    const elapsed = time - lastProgress;
    state.waitMs = Math.max(0, elapsed);
    const timeout = state.started ? stallAfter : Number.isFinite(sample.startupTimeout) && sample.startupTimeout > 0 ? sample.startupTimeout : startupLimit;
    if (elapsed >= timeout) {
      if (state.started && !state.recovered && sample.automatic !== false) return act('recover', '持续缓冲，正在重载当前线路');
      return act('fail', state.started ? '视频持续缓冲，当前线路未能恢复' : '等待视频起播超时');
    }
    state.phase = state.started ? elapsed >= noticeAfter ? 'buffering' : 'playing' : 'loading';
    return result();
  }
  return { state, begin, stop, fail, check };
}

export function matchingEpisode(episodes, name, movie = false) {
  const exact = episodes.findIndex(episode => plainText(episode.name) === plainText(name));
  if (exact >= 0) return exact;
  const number = episodeNumber(name);
  if (number) {
    const numeric = episodes.findIndex(episode => episodeNumber(episode.name) === number);
    if (numeric >= 0) return numeric;
  }
  return movie && episodes.length === 1 ? 0 : -1;
}

function orderedLines(item, priority) {
  const score = line => { const value = priority(item, line); return Number.isFinite(value) ? value : 0; };
  return (item.lines || []).map((value, line) => ({ line, value })).sort((a, b) => score(a.line) - score(b.line));
}

export function matchingLine(item, name, movie = false, excludedURLs = new Set(), priority = () => 0) {
  for (const { line, value } of orderedLines(item, priority)) {
    const episode = matchingEpisode(value.episodes, name, movie);
    if (episode >= 0 && !excludedURLs.has(value.episodes[episode].url)) return { line, episode };
  }
  return null;
}

export function createPlaybackFallback({ maximum = 3, priority = () => 0 } = {}) {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5) throw new Error('自动换源次数不正确');
  if (typeof priority !== 'function') throw new Error('线路优选配置不正确');
  const state = { epoch: 0, attempts: 0, maximum, episode: '', position: 0, key: '', year: '', movie: false, stopped: true };
  let tried = new Set(); let sources = new Set(); let urls = new Set();

  function remember(position) {
    if (Number.isFinite(position) && position >= 0) state.position = position;
  }

  function mark(item, line, index) {
    sources.add(item.uid); tried.add(item.uid + ':' + line);
    const url = item.lines?.[line]?.episodes[index]?.url;
    if (url) urls.add(url);
  }

  function begin(item, line, index, position = 0, name = '') {
    state.epoch++;
    Object.assign(state, { attempts: 0, episode: name || item.lines?.[line]?.episodes[index]?.name || '第' + (index + 1) + '集', position: 0, key: videoKey(item), year: item.year, movie: /电影|片$/.test(item.category || ''), stopped: false });
    tried = new Set(); sources = new Set(); urls = new Set();
    remember(position); mark(item, line, index);
  }

  function candidate(current, variants = []) {
    if (!current || state.stopped || state.attempts >= maximum || videoKey(current) !== state.key) return null;
    for (const { line, value } of orderedLines(current, priority)) {
      const key = current.uid + ':' + line;
      if (tried.has(key)) continue;
      const episode = matchingEpisode(value.episodes, state.episode, state.movie);
      if (episode < 0) continue;
      const url = value.episodes[episode].url;
      if (url && urls.has(url)) continue;
      return { type: 'line', item: current, line, episode };
    }
    const item = [...variants].sort((a, b) => (Number(priority(a)) || 0) - (Number(priority(b)) || 0)).find(variant => variant.year && state.year && videoKey(variant) === state.key && !sources.has(variant.uid) && validVideoId(variant.source, variant.id));
    if (!item) return null;
    return { type: 'source', item };
  }

  function next(current, variants = []) {
    const value = candidate(current, variants);
    if (!value) return null;
    state.attempts++;
    if (value.type === 'line') mark(value.item, value.line, value.episode);
    else sources.add(value.item.uid);
    return value;
  }

  function stop() { state.epoch++; state.stopped = true; }
  function lineFor(item) { return videoKey(item) === state.key ? matchingLine(item, state.episode, state.movie, urls, priority) : null; }
  return { state, begin, remember, mark, next, available: (current, variants) => Boolean(candidate(current, variants)), stop, lineFor };
}

export function createVariantDiscovery({ request, onChange = () => {}, sources = SOURCES } = {}) {
  if (typeof request !== 'function' || typeof onChange !== 'function' || !Array.isArray(sources) || sources.some(source => !SOURCES.some(value => value.id === source?.id))) throw new Error('来源查询配置不正确');
  const state = { group: null, loading: false, completed: 0, total: 0, failed: [] };
  let version = 0; let controller;

  function stop() { version++; controller?.abort(); state.loading = false; }

  async function open(group) {
    if (!group || !Array.isArray(group.variants) || !plainText(group.title)) throw new Error('影片来源信息不正确');
    stop(); const current = version; const activeController = new AbortController(); controller = activeController;
    const missing = sources.filter(source => source.search !== false && !group.variants.some(variant => variant.source === source.id));
    Object.assign(state, { group, loading: Boolean(missing.length), completed: 0, total: missing.length, failed: [] }); onChange();
    await Promise.allSettled(missing.map(async source => {
      try {
        const result = await request(source.id, { query: group.title, signal: activeController.signal });
        if (current !== version) return;
        if (!Array.isArray(result?.videos)) throw new Error('来源查询结果不正确');
        const matches = result.videos.filter(item => item && videoKey(item) === videoKey(group));
        if (matches.length) group.variants = groupVideos([...group.variants, ...matches])[0].variants;
      } catch {
        if (current !== version) return;
        state.failed.push(source.id);
      }
      state.completed++; state.loading = state.completed < state.total; onChange();
    }));
    if (current === version && controller === activeController) controller = null;
  }

  return { state, open, stop };
}
