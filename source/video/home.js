const featuredTitles = ['琅琊榜', '漫长的季节', '武林外传', '楚门的世界', '星际穿越', '肖申克的救赎'];
const sectionQueries = {
  tv: { mode: 'browse', category: 'tv' },
  movie: { mode: 'browse', category: 'movie' },
  short: { mode: 'browse', category: 'short', type: 52 },
};

export async function requestHomeSources(sources, options, request) {
  if (!Array.isArray(sources) || sources.some(source => typeof source !== 'string') || !options || typeof request !== 'function') throw new Error('首页来源查询配置不正确');
  let empty;
  for (const source of [...new Set(sources)]) {
    if (options.signal?.aborted) throw options.signal.reason;
    try {
      const result = await request(source, options);
      if (options.signal?.aborted) throw options.signal.reason;
      if (!Array.isArray(result?.videos)) throw new Error('首页目录格式不正确');
      if (result.videos.some(item => item && (!options.query || item.title === options.query))) return result;
      empty = result;
    } catch (error) { if (options.signal?.aborted) throw error; }
  }
  if (empty) return { ...empty, videos: [] };
  throw new Error('来源暂时无法连接，可以重试或搜索片名');
}

export function createHomeLoader({ request, onChange = () => {} } = {}) {
  if (typeof request !== 'function' || typeof onChange !== 'function') throw new Error('需要提供首页查询和更新方法');
  const jobs = [
    ...featuredTitles.map(query => ({ section: 'picks', options: { query }, phase: 'idle', items: [], pending: null })),
    ...Object.entries(sectionQueries).map(([section, options]) => ({ section, options, phase: 'idle', items: [], pending: null })),
  ];
  const state = { picks: [], tv: [], movie: [], short: [], loading: false, sections: {} };
  let opening;

  function update(notify = true) {
    state.loading = jobs.some(job => job.phase === 'loading');
    for (const section of ['picks', 'tv', 'movie', 'short']) {
      const entries = jobs.filter(job => job.section === section);
      state[section] = entries.flatMap(job => job.items);
      const failed = entries.filter(job => job.phase === 'failed').length;
      const empty = entries.filter(job => job.phase === 'empty').length;
      const loading = entries.some(job => job.phase === 'loading');
      state.sections[section] = {
        loading, failed, empty,
        phase: loading ? 'loading' : failed ? 'failed' : state[section].length ? 'ready' : entries.some(job => job.phase === 'idle') ? 'idle' : 'empty',
      };
    }
    if (notify) onChange();
  }

  function run(selected, retrySources = false) {
    const started = selected.filter(job => job.phase !== 'loading' && job.phase !== 'ready');
    for (const job of started) {
      job.phase = 'loading';
      job.pending = Promise.resolve().then(() => request({ ...job.options, retrySources })).then(result => {
        if (!Array.isArray(result?.videos)) throw new Error('首页目录格式不正确');
        job.items = job.options.query ? result.videos.filter(item => item.title === job.options.query) : result.videos;
        job.phase = job.items.length ? 'ready' : 'empty';
      }).catch(() => { job.phase = 'failed'; }).finally(() => { job.pending = null; update(); });
    }
    update();
    return Promise.all(selected.map(job => job.pending));
  }

  update(false);
  return {
    state,
    open() {
      if (opening) return opening;
      if (!jobs.some(job => job.phase === 'idle' || job.phase === 'loading')) return Promise.resolve();
      opening = run(jobs.filter(job => job.phase === 'idle' || job.phase === 'loading')).finally(() => { opening = null; });
      return opening;
    },
    retry(section) {
      if (!Object.hasOwn(state.sections, section)) throw new Error('首页栏目不正确');
      return run(jobs.filter(job => job.section === section && job.phase !== 'ready'), true);
    },
  };
}
