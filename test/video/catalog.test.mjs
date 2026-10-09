import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogLoader, catalogSummary } from '../../source/video/catalog.js';

const query = { sources: ['liangzi', 'ruyi'], mode: 'browse', category: 'anime', type: 29, query: '' };
const video = (source, id, year = '2026') => ({ source, origin: source, id: String(id), uid: source + ':' + id, title: '影片' + id, year, area: '大陆', remarks: '更新至12集' });
const deferred = () => { let resolve; let reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('catalog loaders validate dependencies and query scope', async () => {
  assert.throws(() => createCatalogLoader(), /查询方法/);
  for (const options of [{ batchPages: 0 }, { batchPages: 21 }, { batchPages: 1.5 }, { minimumResults: 0 }, { minimumResults: 1.5 }, ...[0, 6, 1.5, NaN, Infinity, '4', null].map(concurrency => ({ concurrency }))]) assert.throws(() => createCatalogLoader({ request: async () => {}, ...options }), /范围/);
  const loader = createCatalogLoader({ request: async () => ({ videos: [], pages: 1 }) });
  for (const invalid of [null, {}, { sources: [] }]) await assert.rejects(loader.open(invalid), /来源/);
  for (const progressive of [null, 'true', 1]) await assert.rejects(loader.open(query, { progressive }), /策略/);
  await loader.fill(); await loader.more(); loader.stop();
  assert.equal(loader.state.items.length, 0);
});

test('progressive initial searches stop queued sources after enough grouped results and explicit continuation expands scope', async () => {
  for (const concurrency of [1, 4]) {
    const sources = Array.from({ length: 8 }, (_, index) => 'provider' + index); const calls = [];
    const loader = createCatalogLoader({ concurrency, minimumResults: 2, request: async (source, options) => {
      calls.push([source, options.page]);
      return { videos: [video(source, source + '-' + options.page + '-1'), video(source, source + '-' + options.page + '-2')], pages: 2 };
    } });
    const search = { sources, query: '凡人' };
    await loader.open(search, { progressive: true });
    assert.equal(calls.length, concurrency); assert.ok(catalogSummary(loader.state).count >= 2);
    assert.equal(loader.state.feeds.filter(feed => feed.page === 0).length, sources.length - concurrency);
    assert.equal(catalogSummary(loader.state).phase, 'partial'); assert.equal(catalogSummary(loader.state).hasMore, true);
    await loader.open(search, { progressive: true }); assert.equal(calls.length, concurrency);
    await loader.more(); assert.equal(calls.length, concurrency + sources.length);
    assert.equal(loader.state.feeds.filter(feed => feed.page === 0).length, 0);
    assert.deepEqual(calls.slice(-sources.length).map(call => call[0]), sources);
  }
});

test('progressive searches keep querying through source failures, empty replies and duplicate titles', async () => {
  const sources = ['broken', 'empty', 'first', 'duplicate', 'last']; const calls = [];
  const loader = createCatalogLoader({ concurrency: 1, minimumResults: 2, request: async source => {
    calls.push(source); if (source === 'broken') throw new Error('source failed');
    return { videos: source === 'empty' ? [] : [{ ...video(source, source), title: source === 'last' ? '另一部影片' : '同一部影片' }], pages: 1 };
  } });
  await loader.open({ sources, query: '凡人' }, { progressive: true });
  assert.deepEqual(calls, sources); assert.equal(catalogSummary(loader.state).count, 2);
  assert.deepEqual(catalogSummary(loader.state).failed, ['broken']);
});

test('progressive search restores explicitly loaded pages without re-querying unseen sources', async () => {
  const calls = []; const sources = ['unseen', 'first', 'second'];
  const loader = createCatalogLoader({ concurrency: 1, minimumResults: 1, request: async (source, options) => {
    calls.push([source, options.page]); return { videos: [video(source, source + '-' + options.page)], pages: 4 };
  } });
  await loader.open({ sources, query: '凡人' }, { progressive: true, pages: { first: 2, second: 1 } });
  assert.deepEqual(calls, [['first', 1], ['second', 1], ['first', 2]]);
  assert.equal(loader.state.feeds.find(feed => feed.source === 'unseen').page, 0);
});

test('catalog source queues bound active requests while publishing fast results and advancing past failures', async () => {
  const sources = Array.from({ length: 12 }, (_, index) => 'provider' + index);
  const jobs = []; let active = 0; let maximum = 0;
  const loader = createCatalogLoader({ request: (source, options) => {
    const job = { source, options, ...deferred() }; jobs.push(job);
    active++; maximum = Math.max(maximum, active);
    return job.promise.finally(() => active--);
  } });
  const pending = loader.open({ ...query, sources });
  assert.equal(jobs.length, 4); assert.equal(maximum, 4);
  jobs[1].resolve({ videos: [video(jobs[1].source, 1)], pages: 1 }); await tick();
  assert.equal(loader.state.items[0].source, sources[1]); assert.equal(loader.state.loading, true);
  assert.equal(jobs.length, 5); assert.equal(jobs[4].source, sources[4]);
  jobs[2].reject(new Error('provider failed')); await tick();
  assert.deepEqual(catalogSummary(loader.state).failed, [sources[2]]);
  assert.equal(jobs.length, 6); assert.equal(jobs[5].source, sources[5]);
  for (let index = 0; index < sources.length; index++) {
    if (index === 1 || index === 2) continue;
    jobs[index].resolve({ videos: [video(jobs[index].source, 1)], pages: 1 }); await tick();
  }
  await pending;
  assert.equal(maximum, 4); assert.equal(active, 0); assert.equal(loader.state.items.length, 11);
  assert.deepEqual(jobs.map(job => job.source), sources); assert.equal(loader.state.loading, false);
  const retry = loader.more(); assert.equal(jobs.length, 13); assert.equal(jobs[12].source, sources[2]);
  assert.equal(jobs[12].options.page, 1); assert.equal(jobs[12].options.retrySources, true);
  jobs[12].resolve({ videos: [video(sources[2], 1)], pages: 1 }); await retry;
  assert.equal(catalogSummary(loader.state).phase, 'complete'); assert.equal(loader.state.items.length, 12);
});

test('automatic filtered fills stop queued pages at the result target without hiding remaining pages', async () => {
  for (const concurrency of [1, 4]) {
    const sources = Array.from({ length: 6 }, (_, index) => 'provider' + index);
    const calls = [];
    const loader = createCatalogLoader({ concurrency, minimumResults: 1, request: async (source, options) => {
      calls.push([source, options.page]);
      return { videos: [video(source, source + '-' + options.page, options.page === 1 ? '2026' : '2020')], pages: 4 };
    } });
    await loader.open({ ...query, sources }, { filters: { year: '2020' } });
    assert.deepEqual(calls.slice(0, sources.length), sources.map(source => [source, 1]));
    assert.equal(calls.length, sources.length + concurrency);
    const summary = catalogSummary(loader.state);
    assert.equal(summary.count, concurrency);
    assert.equal(summary.queried, calls.length);
    assert.equal(summary.total, sources.length * 4);
    assert.equal(summary.phase, 'partial'); assert.equal(summary.hasMore, true);
    assert.equal(loader.state.loading, false);
    await loader.fill(); assert.equal(calls.length, sources.length + concurrency);
    await loader.more();
    assert.equal(calls.length, sources.length * 2 + concurrency);
    assert.deepEqual(calls.slice(-sources.length), sources.map((source, index) => [source, index < concurrency ? 3 : 2]));
    assert.equal(new Set(calls.map(call => JSON.stringify(call))).size, calls.length);
    assert.equal(catalogSummary(loader.state).phase, 'partial');
  }
});

test('stopping or replacing a catalog never starts queued requests from its old scope', async () => {
  for (const action of ['stop', 'replace']) {
    const waiting = deferred(); const calls = [];
    const loader = createCatalogLoader({ concurrency: 1, request: (source, options) => {
      calls.push({ source, ...options });
      return options.query === 'new' ? Promise.resolve({ videos: [video(source, 2)], pages: 1 }) : waiting.promise;
    } });
    const pending = loader.open({ sources: ['liangzi', 'ruyi', 'feifan'], query: 'old' });
    assert.equal(calls.length, 1);
    if (action === 'stop') loader.stop();
    else await loader.open({ sources: ['liangzi'], query: 'new' });
    assert.equal(calls[0].signal.aborted, true);
    waiting.resolve({ videos: [video('liangzi', 1)], pages: 5 }); await pending;
    assert.equal(calls.filter(call => call.query === 'old').length, 1);
    assert.equal(loader.state.items.length, action === 'stop' ? 0 : 1);
    if (action === 'replace') assert.equal(loader.state.items[0].id, '2');
    assert.equal(loader.state.loading, false);
  }
});

test('serialized catalog queues preserve restored page limits and explicit pagination', async () => {
  const calls = [];
  const loader = createCatalogLoader({ concurrency: 1, request: async (source, options) => {
    calls.push([source, options.page]); return { videos: [video(source, options.page)], pages: 4 };
  } });
  await loader.open({ ...query, sources: ['liangzi', 'ruyi', 'feifan'] }, { pages: { liangzi: 2, ruyi: 1, feifan: 3 } });
  assert.deepEqual(calls, [['liangzi', 1], ['ruyi', 1], ['feifan', 1], ['liangzi', 2], ['feifan', 2], ['feifan', 3]]);
  assert.deepEqual(catalogSummary(loader.state).pages, { liangzi: 2, ruyi: 1, feifan: 3 });
  await loader.more();
  assert.deepEqual(calls.slice(-3), [['liangzi', 3], ['ruyi', 2], ['feifan', 4]]);
});

test('health reordering preserves catalog identity and retries only missed pages without replacing visible results', async () => {
  const calls = []; let failing = true;
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([source, options.page, options.retrySources]);
    if (source === 'ruyi' && failing) throw new Error('unavailable');
    return { videos: [video(source, options.page)], pages: 1 };
  } });
  const initial = { sources: ['ruyi', 'liangzi'], query: '凡人' };
  await loader.open(initial);
  assert.deepEqual(calls.map(call => call[0]), initial.sources);
  const retained = loader.state.items[0]; const key = loader.state.key;
  const reordered = { ...initial, sources: ['liangzi', 'ruyi', 'liangzi'] };
  await loader.open(reordered);
  assert.equal(calls.length, 2); assert.equal(loader.state.key, key); assert.equal(loader.state.items[0], retained);
  failing = false; await loader.open(reordered, { retrySources: true });
  assert.deepEqual(calls, [['ruyi', 1, false], ['liangzi', 1, false], ['ruyi', 1, true]]);
  assert.equal(loader.state.items[0], retained); assert.equal(catalogSummary(loader.state).phase, 'complete');
});

test('catalog pagination advances each source independently, reuses a query and replaces duplicate records', async () => {
  const calls = []; const snapshots = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([source, options.page]); assert.equal(options.mode, 'browse'); assert.ok(options.signal);
    return { videos: [{ ...video(source, 1), remarks: '更新至' + options.page + '集' }], pages: source === 'liangzi' ? 2 : 1 };
  }, onChange: () => snapshots.push(loader.state.loading) });
  await loader.open({ ...query, sources: ['liangzi', 'ruyi', 'liangzi'] });
  assert.equal(loader.state.feeds.length, 2);
  await loader.open({ ...query, sources: ['liangzi', 'ruyi', 'liangzi'] });
  assert.equal(calls.length, 2);
  await loader.more();
  assert.deepEqual(calls, [['liangzi', 1], ['ruyi', 1], ['liangzi', 2]]);
  assert.equal(loader.state.items.length, 2); assert.equal(loader.state.items[0].remarks, '更新至2集');
  const summary = catalogSummary(loader.state);
  assert.equal(summary.queried, 3); assert.equal(summary.total, 3); assert.equal(summary.phase, 'complete'); assert.equal(summary.hasMore, false);
  assert.ok(snapshots.includes(true)); assert.equal(snapshots.at(-1), false);
  await loader.more(); assert.equal(calls.length, 3);
  await loader.open(query, { force: true }); assert.equal(calls.length, 5);
});

test('restoring catalogue pages preserves filters and queries only each source previously visited scope', async () => {
  const calls = []; const snapshots = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([source, options.page]); assert.equal(options.year, undefined); assert.equal(loader.state.filters.year, '2015');
    return { videos: [video(source, options.page)], pages: 8 };
  }, onChange: () => snapshots.push(loader.state.restoring) });
  await loader.open(query, { filters: { year: '2015', area: 'mainland', status: 'complete' }, pages: { liangzi: 3, ruyi: 1, ignored: 20 } });
  assert.deepEqual(calls, [['liangzi', 1], ['ruyi', 1], ['liangzi', 2], ['liangzi', 3]]);
  assert.deepEqual(loader.state.filters, { year: '2015', area: 'mainland', status: 'complete' });
  assert.equal(catalogSummary(loader.state).queried, 4); assert.equal(catalogSummary(loader.state).count, 0);
  assert.equal(loader.state.restoring, false); assert.equal(loader.state.loading, false); assert.ok(snapshots.includes(true));
  await loader.open(query, { pages: { liangzi: 20 } }); assert.equal(calls.length, 4);
});

test('restoring isolates unavailable sources and shortened upstream directories without unbounded retries', async () => {
  const calls = [];
  const loader = createCatalogLoader({ request: async (source, { page }) => {
    calls.push([source, page]); if (source === 'ruyi') throw new Error('unavailable');
    return { videos: [video(source, page)], pages: 2 };
  } });
  await loader.open(query, { pages: { liangzi: 20, ruyi: 3 } });
  assert.deepEqual(calls, [['liangzi', 1], ['ruyi', 1], ['liangzi', 2]]);
  assert.deepEqual(catalogSummary(loader.state).failed, ['ruyi']); assert.equal(loader.state.restoring, false);
  assert.deepEqual(catalogSummary(loader.state).pages, { liangzi: 2, ruyi: 3 });
  for (const pages of [null, { liangzi: 21 }, { liangzi: -1 }, { liangzi: '20' }]) {
    await loader.open({ ...query, sources: ['liangzi'] }, { force: true, pages, filters: null });
    assert.equal(loader.state.feeds[0].page, 1); assert.equal(loader.state.restoring, false);
  }
});

test('pausing or replacing a restoration ignores late pages and never resumes its old scope', async () => {
  const waiting = deferred(); const requested = deferred(); let signal;
  const loader = createCatalogLoader({ request: async (source, options) => {
    if (options.query === 'old' && options.page === 2) { signal = options.signal; requested.resolve(); return waiting.promise; }
    return { videos: [video(source, options.query === 'new' ? 99 : options.page)], pages: options.query === 'new' ? 1 : 5 };
  } });
  const pending = loader.open({ ...query, sources: ['liangzi'], query: 'old' }, { pages: { liangzi: 4 } }); await requested.promise;
  assert.equal(loader.state.restoring, true); loader.stop(); assert.equal(signal.aborted, true);
  await loader.open({ ...query, sources: ['liangzi'], query: 'new' }); waiting.resolve({ videos: [video('liangzi', 2)], pages: 5 }); await pending;
  assert.deepEqual(loader.state.items.map(item => item.id), ['99']); assert.equal(loader.state.restoring, false);
  assert.equal(catalogSummary(loader.state).phase, 'complete');
});

test('changing filters during restoration cancels old work and starts a fresh bounded filter scan', async () => {
  const waiting = deferred(); const requested = deferred(); let first = true; let signal; const calls = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push(options.page);
    if (options.page === 2 && first) { first = false; signal = options.signal; requested.resolve(); return waiting.promise; }
    return { videos: [video(source, options.page)], pages: 8 };
  } });
  const pending = loader.open({ ...query, sources: ['liangzi'] }, { pages: { liangzi: 6 } }); await requested.promise;
  loader.setFilters({ year: '2015' }); assert.equal(signal.aborted, true); assert.equal(loader.state.restoring, false);
  await loader.fill(); waiting.resolve({ videos: [video('liangzi', 99)], pages: 8 }); await pending;
  assert.deepEqual(calls, [1, 2, 2, 3, 4]); assert.equal(loader.state.filters.year, '2015');
  assert.deepEqual(loader.state.items.map(item => item.id), ['1', '2', '3', '4']); assert.equal(loader.state.loading, false);
});

test('fast source results become usable while a slower source is pending, and pausing keeps completed pages', async () => {
  const slow = deferred(); const fastVisible = deferred(); let slowSignal;
  const loader = createCatalogLoader({ request: async (source, options) => {
    if (source === 'ruyi') { slowSignal = options.signal; return slow.promise; }
    return { videos: [video(source, 1)], pages: 2 };
  }, onChange: () => { if (loader.state.items.length) fastVisible.resolve(); } });
  const pending = loader.open(query); await fastVisible.promise;
  assert.equal(loader.state.loading, true); assert.equal(catalogSummary(loader.state).queried, 1);
  assert.deepEqual(loader.state.items.map(item => item.uid), ['liangzi:1']);
  loader.stop(); assert.equal(slowSignal.aborted, true); assert.equal(catalogSummary(loader.state).phase, 'paused');
  slow.resolve({ videos: [video('ruyi', 99)], pages: 1 }); await pending;
  assert.deepEqual(loader.state.items.map(item => item.uid), ['liangzi:1']); assert.equal(loader.state.feeds[0].page, 1);
});

test('incremental results merge late sources without duplicates or leaking into a replacement query', async () => {
  const old = deferred(); const visible = deferred(); const calls = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([options.query, source]);
    if (options.query === 'old' && source === 'ruyi') return old.promise;
    return { videos: [video(source, options.query === 'old' ? 1 : 2)], pages: 1 };
  }, onChange: () => { if (loader.state.items.some(item => item.id === '1')) visible.resolve(); } });
  const pending = loader.open({ ...query, query: 'old' }); await visible.promise;
  await loader.open({ ...query, query: 'new' }); old.resolve({ videos: [video('ruyi', 99)], pages: 1 }); await pending;
  assert.deepEqual(loader.state.items.map(item => item.id), ['2', '2']); assert.equal(loader.state.loading, false);
  assert.equal(catalogSummary(loader.state).phase, 'complete'); assert.equal(calls.length, 4);
});

test('filtered scans stop at their batch budget, keep conditions, and continue without claiming the whole catalog is empty', async () => {
  const calls = [];
  const loader = createCatalogLoader({ request: async (source, { page }) => {
    calls.push(page); return { videos: [video(source, page)], pages: 8 };
  } });
  await loader.open({ ...query, sources: ['liangzi'] });
  loader.setFilters({ year: '2020' }); await loader.fill();
  assert.deepEqual(calls, [1, 2, 3, 4]);
  assert.equal(loader.state.filters.year, '2020');
  let summary = catalogSummary(loader.state);
  assert.equal(summary.count, 0); assert.equal(summary.phase, 'partial'); assert.equal(summary.hasMore, true);
  await loader.more(); assert.deepEqual(calls, [1, 2, 3, 4, 5, 6, 7]);
  await loader.more(); summary = catalogSummary(loader.state);
  assert.equal(summary.phase, 'complete'); assert.equal(summary.count, 0); assert.equal(summary.hasMore, false);
});

test('automatic scans stop after enough matching films and explicit continuation still reads the next page', async () => {
  const calls = [];
  const loader = createCatalogLoader({ minimumResults: 2, request: async (source, { page }) => {
    calls.push(page); return { videos: [video(source, page, page > 1 ? '2020' : '2026')], pages: 8 };
  } });
  await loader.open({ ...query, sources: ['liangzi'] });
  loader.setFilters({ year: '2020' }); await loader.fill();
  assert.deepEqual(calls, [1, 2, 3]); assert.equal(catalogSummary(loader.state).count, 2);
  await loader.fill(); assert.equal(calls.length, 3);
  await loader.more(); assert.deepEqual(calls, [1, 2, 3, 4]);
  loader.setFilters(); await loader.fill(); assert.equal(calls.length, 4);
});

test('partial source failures are isolated and retried at the missed page only on explicit continuation', async () => {
  const calls = []; let failing = true;
  const loader = createCatalogLoader({ request: async (source, { page }) => {
    calls.push([source, page]);
    if (source === 'ruyi' && failing) throw new Error('private upstream detail');
    return { videos: [video(source, page)], pages: 1 };
  } });
  await loader.open(query);
  let summary = catalogSummary(loader.state);
  assert.equal(summary.phase, 'failed'); assert.equal(summary.hasMore, true); assert.deepEqual(summary.failed, ['ruyi']); assert.equal(loader.state.items.length, 1);
  loader.setFilters({ year: '2020' }); await loader.fill(); assert.equal(calls.length, 2);
  failing = false; await loader.more();
  assert.deepEqual(calls, [['liangzi', 1], ['ruyi', 1], ['ruyi', 1]]);
  summary = catalogSummary(loader.state); assert.equal(summary.phase, 'complete'); assert.equal(summary.count, 0);
  assert.doesNotMatch(JSON.stringify(loader.state), /private upstream/);
});

test('explicitly resubmitting the same search retries missed sources while keeping returned films and filters', async () => {
  const calls = []; let failing = true; const snapshots = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([source, options.page, options.retrySources]);
    if (source === 'ruyi' && failing) throw new Error('source unavailable');
    return { videos: [video(source, 1)], pages: 1 };
  }, onChange: () => snapshots.push(loader.state.items.length) });
  const search = { sources: query.sources, query: '凡人' };
  await loader.open(search); loader.setFilters({ year: '2026' });
  await loader.open(search); assert.equal(calls.length, 2);
  failing = false; snapshots.length = 0;
  await loader.open(search, { retrySources: true });
  assert.deepEqual(calls, [['liangzi', 1, false], ['ruyi', 1, false], ['ruyi', 1, true]]);
  assert.deepEqual(loader.state.items.map(item => item.uid), ['liangzi:1', 'ruyi:1']);
  assert.equal(loader.state.filters.year, '2026'); assert.ok(snapshots.every(count => count >= 1));
  assert.equal(catalogSummary(loader.state).phase, 'complete');
  await loader.open({ ...search, query: '新片名' }, { retrySources: true });
  assert.equal(loader.state.filters.year, ''); assert.ok(calls.slice(-2).every(call => call[2] === true));
});

test('failed service requests and skipped sources can be retried by submitting a fresh search', async () => {
  let failing = true; const calls = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([source, options.query, options.retrySources]);
    if (failing) { const error = new Error('private service diagnostics'); error.name = 'QueryServiceError'; throw error; }
    if (!options.retrySources) { const error = new Error('cooling down'); error.name = 'SourceCooldownError'; throw error; }
    return { videos: [video(source, 1)], pages: 1 };
  } });
  await loader.open(query);
  assert.equal(catalogSummary(loader.state).queried, 0);
  assert.deepEqual(catalogSummary(loader.state).serviceFailed, query.sources);
  assert.doesNotMatch(JSON.stringify(loader.state), /private service/);
  failing = false;
  await loader.open({ ...query, query: '另一个片名' });
  assert.deepEqual(catalogSummary(loader.state).deferred, query.sources);
  assert.deepEqual(catalogSummary(loader.state).serviceFailed, []);
  await loader.open({ ...query, query: '另一个片名' }, { retrySources: true });
  assert.equal(catalogSummary(loader.state).count, 1);
  assert.equal(catalogSummary(loader.state).phase, 'complete');
  assert.ok(calls.slice(-2).every(call => call[2] === true));
});

test('pause aborts in-flight pages and discards late results; changing filters retargets the next scan', async () => {
  const waiting = deferred(); let signal; let first = true;
  const loader = createCatalogLoader({ request: async (source, options) => {
    if (first) { first = false; return { videos: [video(source, 1)], pages: 5 }; }
    signal = options.signal; return waiting.promise;
  } });
  await loader.open({ ...query, sources: ['liangzi'] }); loader.setFilters({ year: '2020' });
  const pending = loader.fill(); assert.equal(catalogSummary(loader.state).phase, 'scanning');
  await loader.fill(); await loader.more();
  loader.stop(); assert.equal(signal.aborted, true); assert.equal(catalogSummary(loader.state).phase, 'paused');
  waiting.resolve({ videos: [video('liangzi', 99, '2020')], pages: 5 }); await pending;
  assert.equal(loader.state.items.length, 1); assert.equal(loader.state.feeds[0].page, 1);
  await loader.fill(); assert.equal(loader.state.items.length, 1);
  loader.setFilters({ year: '2026' }); await loader.fill();
  assert.equal(catalogSummary(loader.state).count, 1);
});

test('filter changes during a request reuse incoming records; clearing filters cancels automatic work', async () => {
  const waiting = deferred(); let signal;
  const loader = createCatalogLoader({ minimumResults: 1, request: async (source, options) => {
    if (options.page === 1) return { videos: [video(source, 1)], pages: 5 };
    signal = options.signal; return waiting.promise;
  } });
  await loader.open({ ...query, sources: ['liangzi'] }); loader.setFilters({ year: '2020' });
  const pending = loader.fill(); loader.setFilters({ year: '2021' });
  waiting.resolve({ videos: [video('liangzi', 2, '2021')], pages: 5 }); await pending;
  assert.equal(catalogSummary(loader.state).count, 1); assert.equal(loader.state.feeds[0].page, 2);
  loader.setFilters({ year: '2020' }); const clearing = loader.fill(); loader.setFilters();
  assert.equal(signal.aborted, true); await clearing;
  assert.equal(loader.state.feeds[0].page, 2); assert.equal(loader.state.filters.year, '');
});

test('new queries invalidate old initial responses and filters chosen during initial loading trigger a bounded fill', async () => {
  const old = deferred(); const initial = deferred(); let oldSignal;
  const calls = [];
  const loader = createCatalogLoader({ minimumResults: 1, request: async (source, options) => {
    calls.push([options.query, options.page]);
    if (options.query === 'old') { oldSignal = options.signal; return old.promise; }
    if (options.page === 1) return initial.promise;
    return { videos: [video(source, options.page, '2020')], pages: 4 };
  } });
  const oldOpen = loader.open({ ...query, sources: ['liangzi'], query: 'old' });
  const nextOpen = loader.open({ ...query, sources: ['liangzi'], query: 'new' });
  assert.equal(oldSignal.aborted, true); assert.equal(catalogSummary(loader.state).phase, 'loading');
  loader.setFilters({ year: '2020' });
  old.resolve({ videos: [video('liangzi', 99)], pages: 4 }); await oldOpen;
  initial.resolve({ videos: [video('liangzi', 1)], pages: 4 }); await nextOpen;
  assert.deepEqual(calls, [['old', 1], ['new', 1], ['new', 2]]);
  assert.ok(loader.state.items.every(item => item.id !== '99')); assert.equal(loader.state.filters.year, '2020');
});

test('query caps and missing filter metadata remain visible after all accessible pages have been read', async () => {
  const loader = createCatalogLoader({ request: async source => ({ videos: [{ ...video(source, 1), year: '', area: '', remarks: '状态不明' }], pages: 1, limited: true }) });
  await loader.open({ ...query, sources: ['liangzi'] }); loader.setFilters({ year: '2020', area: 'mainland', status: 'updating' });
  let summary = catalogSummary(loader.state);
  assert.equal(summary.phase, 'limited'); assert.equal(summary.missingMetadata, true); assert.equal(summary.count, 0); assert.equal(summary.hasMore, false);
  loader.setFilters({ area: 'mainland' }); assert.equal(catalogSummary(loader.state).missingMetadata, true);
  loader.setFilters({ status: 'complete' }); assert.equal(catalogSummary(loader.state).missingMetadata, true);
  loader.setFilters(); summary = catalogSummary(loader.state); assert.equal(summary.missingMetadata, false); assert.equal(summary.count, 1);
});

test('temporarily avoided sources remain selected and retry only on explicit continuation', async () => {
  const calls = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([source, options.page, options.retrySources]);
    if (source === 'ruyi' && !options.retrySources) { const error = new Error('cooldown'); error.name = 'SourceCooldownError'; throw error; }
    return { videos: [video(source, 1)], pages: 1 };
  } });
  await loader.open(query, { pages: { ruyi: 8 } });
  const summary = catalogSummary(loader.state); assert.equal(summary.phase, 'deferred'); assert.deepEqual(summary.deferred, ['ruyi']); assert.deepEqual(summary.failed, []);
  assert.equal(summary.hasMore, true); assert.deepEqual(loader.state.query.sources, query.sources);
  assert.deepEqual(summary.pages, { liangzi: 1, ruyi: 8 });
  loader.setFilters({ year: '2020' }); await loader.fill(); assert.equal(calls.length, 2);
  await loader.more(); assert.deepEqual(calls.at(-1), ['ruyi', 1, true]); assert.equal(catalogSummary(loader.state).phase, 'complete');
  assert.equal(loader.state.items.length, 2);
});

test('manual source reload bypasses cooldown without changing subsequent automatic scan policy', async () => {
  const calls = [];
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push(options.retrySources); return { videos: [video(source, options.page)], pages: 2 };
  } });
  await loader.open({ ...query, sources: ['liangzi'] }, { force: true, retrySources: true });
  loader.setFilters({ year: '2020' }); await loader.fill(); assert.deepEqual(calls, [true, false]);
});

test('leaving before the first restored response preserves the previous page scope across a replacement query', async () => {
  const waiting = deferred(); let first = true; let signal; const calls = [];
  const scope = { ...query, sources: ['liangzi'], query: 'old' };
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push([options.query, options.page]);
    if (first) { first = false; signal = options.signal; return waiting.promise; }
    return { videos: [video(source, options.page)], pages: 5 };
  } });
  const pending = loader.open(scope, { pages: { liangzi: 3 } });
  const remembered = catalogSummary(loader.state).pages;
  assert.deepEqual(remembered, { liangzi: 3 }); assert.equal(catalogSummary(loader.state).queried, 0);
  loader.stop(); assert.equal(signal.aborted, true);
  await loader.open({ ...scope, query: 'new' });
  waiting.resolve({ videos: [video('liangzi', 99)], pages: 5 }); await pending;
  await loader.open(scope, { pages: remembered });
  assert.deepEqual(calls.slice(-3), [['old', 1], ['old', 2], ['old', 3]]);
  assert.equal(catalogSummary(loader.state).queried, 3); assert.deepEqual(loader.state.items.map(item => item.id), ['1', '2', '3']);
});

test('returning to a partially restored cached catalog resumes its missed pages without replacing visible results', async () => {
  const waiting = deferred(); const requested = deferred(); const calls = []; let first = true;
  const scope = { ...query, sources: ['liangzi'] };
  const loader = createCatalogLoader({ request: async (source, options) => {
    calls.push(options.page);
    if (first && options.page === 2) { first = false; requested.resolve(); return waiting.promise; }
    return { videos: [video(source, options.page)], pages: 5 };
  } });
  const pending = loader.open(scope, { pages: { liangzi: 3 } }); await requested.promise;
  await loader.open(scope); assert.equal(calls.length, 2);
  const remembered = catalogSummary(loader.state).pages; loader.stop();
  const visible = loader.state.items[0];
  await loader.open(scope, { pages: remembered });
  waiting.resolve({ videos: [video('liangzi', 99)], pages: 5 }); await pending;
  assert.deepEqual(calls, [1, 2, 2, 3]); assert.equal(loader.state.items[0], visible);
  assert.equal(catalogSummary(loader.state).queried, 3); assert.equal(loader.state.restoring, false);
  await loader.open(scope, { force: true }); assert.deepEqual(catalogSummary(loader.state).pages, { liangzi: 1 });
});
