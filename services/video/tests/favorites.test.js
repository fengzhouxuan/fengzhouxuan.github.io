import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFavorites, favoriteStorageKey } from '../favorites.js';

const film = { uid: 'liangzi:12', source: 'liangzi', id: '12', title: '测试影片', year: '2026' };

test('cloud favorites accept bounded display metadata and exclude playback, history and arbitrary properties', () => {
  const saved = cleanFavorites([{ ...film, title: '<b>测试影片</b>', poster: 'https://example.com/poster.jpg', lines: ['private'], position: 90, token: 'private', playbackKind: 'episodes', tracking: { latest: 12, acknowledged: 8, count: 12, checkedAt: 100 } }]);
  assert.equal(saved.length, 1); assert.equal(saved[0].title, '测试影片');
  assert.deepEqual(saved[0].tracking, { latest: 12, acknowledged: 8, count: 12, checkedAt: 100 });
  for (const key of ['lines', 'token', 'position']) assert.equal(saved[0][key], undefined);
  assert.equal(cleanFavorites([film, film]).length, 1);
  const invalid = cleanFavorites([{ ...film, poster: 'javascript:bad', playbackKind: 'bad', tracking: { latest: -1, acknowledged: 10001, count: 0, checkedAt: 20 } }])[0];
  assert.equal(invalid.poster, ''); assert.equal(invalid.playbackKind, undefined); assert.equal(invalid.tracking.latest, null);
  assert.equal(cleanFavorites([{ ...film, tracking: { checkedAt: -1 } }])[0].tracking, undefined);
  assert.equal(cleanFavorites([{ ...film, title: '长'.repeat(1000) }])[0].title.length, 500);
});

test('cloud favorites reject bad identities and oversized documents instead of silently losing saved films', () => {
  const retired = { ...film, uid: 'zip0:diyi:104', source: 'zip0', id: 'diyi:104' };
  assert.equal(cleanFavorites([retired])[0].uid, retired.uid);
  for (const items of [null, {}, [null], [{ ...film, uid: 'fake' }], [{ ...film, source: 'unknown' }], [{ ...film, title: '' }], Array.from({ length: 101 }, () => film)]) assert.throws(() => cleanFavorites(items));
  assert.equal(favoriteStorageKey(), 'video-favorites'); assert.equal(favoriteStorageKey({ id: '123' }), 'video-favorites:123');
  assert.equal(favoriteStorageKey({ id: '../private' }), 'video-favorites');
});
