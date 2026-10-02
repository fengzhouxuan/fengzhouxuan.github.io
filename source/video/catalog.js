import { filterVideos, groupVideos } from './core.js';

const emptyFilters = () => ({ year: '', area: '', status: '' });
const hasFilters = filters => Boolean(filters.year || filters.area || filters.status);
const available = feed => !feed.failed && !feed.deferred && feed.page < feed.pages;

export function catalogSummary(state) {
  const filters = state.filters;
  const count = groupVideos(filterVideos(state.items, filters)).length;
  const pending = state.feeds.some(feed => feed.page < feed.pages);
  const failed = state.feeds.filter(feed => feed.failed).map(feed => feed.source);
  const deferred = state.feeds.filter(feed => feed.deferred).map(feed => feed.source);
  const limited = state.feeds.some(feed => feed.limited);
  const missingMetadata = state.items.some(item => (filters.year && !item.year) || (filters.area && !item.area) || (filters.status && !filterVideos([item], { status: 'complete' }).length && !filterVideos([item], { status: 'updating' }).length));
  return {
    count, queried: state.feeds.reduce((sum, feed) => sum + feed.page, 0),
    total: state.feeds.reduce((sum, feed) => sum + feed.pages, 0),
    filtered: hasFilters(filters), failed, deferred, limited, missingMetadata,
    hasMore: pending || Boolean(failed.length),
    phase: state.loading ? (state.scanning ? 'scanning' : 'loading') : state.stopped && pending ? 'paused' : failed.length ? 'failed' : deferred.length ? 'deferred' : pending ? 'partial' : limited ? 'limited' : 'complete',
  };
}

export function createCatalogLoader({ request, onChange = () => {}, batchPages = 3, minimumResults = 24 } = {}) {
  if (typeof request !== 'function') throw new Error('需要提供目录查询方法');
  if (!Number.isInteger(batchPages) || batchPages < 1 || batchPages > 20 || !Number.isInteger(minimumResults) || minimumResults < 1) throw new Error('补查范围不正确');
  const state = { items: [], feeds: [], filters: emptyFilters(), query: null, key: '', loading: false, scanning: false, restoring: false, stopped: false };
  let version = 0; let controller;

  function stop() {
    version++; controller?.abort();
    state.loading = false; state.scanning = false; state.restoring = false; state.stopped = true;
    onChange();
  }

  async function scan(force = false, initial = false, targets = null, retrySources = false) {
    const eligible = feed => available(feed) && (!targets || feed.page < targets[feed.source]);
    if (state.loading || !state.feeds.some(eligible) || (!force && (state.stopped || !hasFilters(state.filters) || catalogSummary(state).count >= minimumResults))) return;
    const current = version; controller = new AbortController();
    state.loading = true; state.scanning = !initial && hasFilters(state.filters); state.stopped = false;
    onChange();
    const rounds = initial || !hasFilters(state.filters) ? 1 : batchPages;
    try {
      for (let round = 0; round < rounds; round++) {
        if (current !== version || (round > 0 && (!hasFilters(state.filters) || catalogSummary(state).count >= minimumResults))) break;
        const jobs = state.feeds.filter(eligible).map(feed => ({ feed, page: feed.page + 1 }));
        if (!jobs.length) break;
        await Promise.allSettled(jobs.map(async ({ feed, page }) => {
          try {
            const result = await request(feed.source, { ...state.query, sources: undefined, page, signal: controller.signal, retrySources });
            if (current !== version) return;
            const items = new Map(state.items.map(item => [item.uid, item]));
            for (const item of result.videos) items.set(item.uid, item);
            state.items = [...items.values()];
            feed.page = page; feed.pages = result.pages; feed.limited = Boolean(result.limited); feed.failed = false; feed.deferred = false;
          } catch (error) {
            if (current !== version) return;
            feed.deferred = error?.name === 'SourceCooldownError'; feed.failed = !feed.deferred;
          }
          onChange();
        }));
        if (current !== version) return;
      }
    } finally {
      if (current === version) { state.loading = false; state.scanning = false; onChange(); }
    }
  }

  async function open(query, { force = false, filters = {}, pages = {}, retrySources = false } = {}) {
    if (!query || !Array.isArray(query.sources) || !query.sources.length) throw new Error('至少选择一个查询来源');
    const next = { ...query, sources: [...new Set(query.sources)] };
    const key = JSON.stringify(next);
    if (!force && state.key === key && state.items.length) { onChange(); return; }
    version++; controller?.abort();
    const targets = Object.fromEntries(next.sources.map(source => [source, Number.isInteger(pages?.[source]) && pages[source] > 0 && pages[source] <= 20 ? pages[source] : 0]));
    const restoring = Object.values(targets).some(page => page > 0);
    Object.assign(state, { items: [], feeds: next.sources.map(source => ({ source, page: 0, pages: 1, failed: false, deferred: false, limited: false })), filters: { year: filters?.year || '', area: filters?.area || '', status: filters?.status || '' }, query: next, key, loading: false, scanning: false, restoring, stopped: false });
    const current = version;
    try {
      await scan(true, true, null, retrySources);
      while (current === version && state.feeds.some(feed => available(feed) && feed.page < targets[feed.source])) await scan(true, true, targets);
    } finally {
      if (current === version) { state.restoring = false; onChange(); }
    }
    if (current === version && !restoring) await scan();
  }

  function setFilters(filters = {}) {
    const restoring = state.restoring;
    state.filters = { year: filters.year || '', area: filters.area || '', status: filters.status || '' };
    if (restoring) { stop(); state.stopped = false; onChange(); }
    else if (!hasFilters(state.filters) && state.scanning) stop();
    else { state.stopped = false; onChange(); }
  }

  async function more() {
    if (state.loading) return;
    for (const feed of state.feeds) { feed.failed = false; feed.deferred = false; }
    state.stopped = false;
    await scan(true, false, null, true);
  }

  return { state, open, setFilters, fill: () => scan(), more, stop };
}
