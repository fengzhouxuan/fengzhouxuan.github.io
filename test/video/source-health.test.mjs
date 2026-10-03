import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceHealth } from '../../source/video/experience.js';
import { SOURCES } from '../../source/video/core.js';

function fixture(options = {}) {
  let time = 1000000; const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const health = createSourceHealth({ storage, now: () => time, ...options });
  return { health, storage, saved, age(ms) { time += ms; }, observe(source, operation, successful, elapsedMs = 200) {
    const ticket = health.begin(source, operation); time += elapsedMs; return health.finish(ticket, { successful, elapsedMs });
  }, records() { return JSON.parse(saved.get('video-source-health') || '[]'); } };
}

test('source observations validate configuration and unknown scopes without retaining arbitrary identifiers', () => {
  for (const options of [{ now: null }, { lifetime: 0 }, { lifetime: Infinity }]) assert.throws(() => createSourceHealth(options), /配置/);
  const health = createSourceHealth();
  assert.equal(health.begin('unknown', 'search'), null); assert.equal(health.begin('liangzi', 'https://private.example'), null);
  assert.equal(health.finish(null), false); assert.equal(health.profile('unknown', 'search').observed, false);
  for (const [sources, operation] of [[null, 'search'], [[], 'unknown']]) assert.throws(() => health.order(sources, operation), /范围/);
  assert.deepEqual(health.order(['ruyi', 'liangzi', 'ruyi', 'unknown'], 'search'), ['ruyi', 'liangzi']);
  const ticket = health.begin('liangzi', 'search'); assert.equal(health.finish(ticket, { successful: true, elapsedMs: 10 }), true);
  assert.equal(health.profile('liangzi', 'search').observed, true); health.clear();
});

test('recent query latency prioritizes fast successes, keeps natural unknown order and updates after recovery', () => {
  const f = fixture(); f.observe('liangzi', 'search', true, 6000); f.observe('ruyi', 'search', true, 300);
  assert.deepEqual(f.health.order(['liangzi', 'feifan', 'ruyi'], 'search'), ['ruyi', 'feifan', 'liangzi']);
  f.observe('ruyi', 'search', true, 800); assert.equal(f.health.profile('ruyi', 'search').latencyMs, 600);
  f.observe('ruyi', 'search', false); assert.deepEqual(f.health.order(['ruyi', 'liangzi'], 'search'), ['liangzi']);
  assert.deepEqual(f.health.order(['ruyi', 'liangzi'], 'search', { retry: true }), ['liangzi', 'ruyi']);
  f.observe('ruyi', 'search', true, 100); assert.equal(f.health.profile('ruyi', 'search').failures, 0);
  assert.equal(f.health.profile('ruyi', 'search').cooldownMs, 0); assert.equal(f.health.order(['liangzi', 'ruyi'], 'search')[0], 'ruyi');
});

test('failure cooldowns are bounded, expire automatically and never mix search, browse and detail evidence', () => {
  const f = fixture();
  for (const expected of [60000, 120000, 240000, 300000, 300000, 300000]) {
    f.observe('liangzi', 'search', false); assert.equal(f.health.profile('liangzi', 'search').cooldownMs, expected);
  }
  assert.deepEqual(f.health.order(['liangzi'], 'search'), []);
  assert.deepEqual(f.health.order(['liangzi'], 'browse'), ['liangzi']); assert.equal(f.health.profile('liangzi', 'detail').observed, false);
  f.observe('liangzi', 'detail', true); assert.equal(f.health.profile('liangzi', 'search').failures, 5);
  f.age(300000); assert.deepEqual(f.health.order(['liangzi'], 'search'), ['liangzi']);
  f.age(86400001); assert.equal(f.health.profile('liangzi', 'search').observed, false);
});

test('concurrent queries accept only the latest attempt and ignore cancellations and invalid timings', () => {
  const f = fixture(); const old = f.health.begin('liangzi', 'search'); const current = f.health.begin('liangzi', 'search');
  assert.equal(f.health.finish(old, { successful: false, elapsedMs: 10 }), false);
  assert.equal(f.health.finish(current, { successful: true, elapsedMs: 20 }), true);
  assert.equal(f.health.finish(current, { successful: false, elapsedMs: 20 }), false);
  for (const sample of [{ successful: false, elapsedMs: 50, ignored: true }, { elapsedMs: 50 }, { successful: false, elapsedMs: -1 }, { successful: true, elapsedMs: 120001 }, { successful: true, elapsedMs: NaN }]) {
    assert.equal(f.health.finish(f.health.begin('liangzi', 'search'), sample), false);
    assert.equal(f.health.profile('liangzi', 'search').failures, 0);
  }
  const invalid = f.health.begin('liangzi', 'search'); assert.equal(f.health.finish(invalid), false);
  const future = f.health.begin('ruyi', 'search'); f.age(-1); assert.equal(f.health.finish(future, { successful: false, elapsedMs: 0 }), false);
});

test('storage failures retain current-tab evidence and clearing invalidates in-flight attempts', () => {
  const blocked = fixture({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } } });
  blocked.observe('ruyi', 'search', false); assert.equal(blocked.health.profile('ruyi', 'search').failures, 1);
  const ticket = blocked.health.begin('liangzi', 'search'); blocked.health.clear();
  assert.equal(blocked.health.finish(ticket, { successful: true, elapsedMs: 1 }), false); assert.equal(blocked.health.profile('ruyi', 'search').observed, false);
  const missing = fixture({ storage: null }); missing.observe('liangzi', 'browse', true);
  assert.equal(missing.health.profile('liangzi', 'browse').latencyMs, 200);
  missing.health.clear(); assert.equal(missing.health.profile('liangzi', 'browse').observed, false);
});

test('persisted observations are sanitized, bounded and independent of video or media addresses', () => {
  const f = fixture();
  for (const source of SOURCES) for (const operation of ['search', 'browse', 'detail']) f.observe(source.id, operation, true);
  assert.equal(f.records().length, SOURCES.length * 3); assert.doesNotMatch(JSON.stringify(f.records()), /vod_id|url|m3u8|title/);
  const good = f.records().find(value => value.source === 'liangzi' && value.operation === 'search');
  const invalid = [null, { ...good, source: 'https://private.example' }, { ...good, operation: 'unknown' }, { ...good, latencyMs: -1 }, { ...good, failures: 6 }, { ...good, retryAt: good.updatedAt + 300001 }, { ...good, startedAt: good.updatedAt + 1 }, { ...good, updatedAt: 2000000 }];
  f.saved.set('video-source-health', JSON.stringify([{ ...good, secret: 'private', url: 'https://private.example' }, ...invalid]));
  assert.equal(f.health.profile('liangzi', 'search').observed, true); assert.equal(f.health.profile('ruyi', 'search').observed, false);
  f.observe('ruyi', 'search', true); assert.doesNotMatch(f.saved.get('video-source-health'), /secret|private/);
  for (const value of ['bad json', '{}']) { f.saved.set('video-source-health', value); assert.equal(f.health.profile('liangzi', 'search').observed, false); }
});

test('other tabs share newer evidence and late older results cannot overwrite a newer stored result', () => {
  const f = fixture(); const older = f.health.begin('liangzi', 'search'); f.age(10);
  const other = createSourceHealth({ storage: f.storage, now: () => 1000010 });
  other.finish(other.begin('liangzi', 'search'), { successful: true, elapsedMs: 100 });
  assert.equal(f.health.finish(older, { successful: false, elapsedMs: 10 }), false);
  assert.equal(f.health.profile('liangzi', 'search').failures, 0);
  other.clear(); assert.equal(f.health.profile('liangzi', 'search').observed, false);
  f.observe('ruyi', 'browse', false); assert.equal(other.profile('ruyi', 'browse').observed, false);
});
