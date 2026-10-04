import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMusicLibrary, mergeMusicLibraries, musicLibraryStorageKey, EMPTY_MUSIC_LIBRARY as empty } from '../shared/music-library.js';
import { mergeRecords } from '../shared/sync-data.js';

const song = (id, extra = {}) => ({ uid: 'netease-' + id, source: 'netease', songid: String(id), title: '歌曲' + id, artist: '', album: '', ...extra });
const list = (tracks = [], name = '歌单', id = 'pl-one') => ({ id, name, tracks });
const library = (favorites = [], playlists = []) => ({ favorites, playlists });

test('music snapshots preserve playback lookup metadata, deduplicate songs and strip volatile or unsafe fields', () => {
  const raw = song(12, { artist: ['歌手甲', '歌手乙'], cover: 'javascript:alert(1)', pageUrl: 'https://music.example/12', audioUrl: 'secret', lrc: 'secret', qqIndex: 2, featured: true, unknown: 'secret', keyword: '歌手', title: '标题\u0000' });
  const value = cleanMusicLibrary(library([raw, raw], [list([song(13)])]));
  assert.equal(value.favorites.length, 1); assert.equal(value.favorites[0].artist, '歌手甲 / 歌手乙'); assert.equal(value.favorites[0].title, '标题');
  assert.equal(value.favorites[0].audioUrl, undefined); assert.equal(value.favorites[0].lrc, undefined); assert.equal(value.favorites[0].unknown, undefined); assert.equal(value.favorites[0].cover, undefined);
  assert.equal(value.favorites[0].qqIndex, 2); assert.equal(value.favorites[0].pageUrl, 'https://music.example/12'); assert.equal(value.favorites[0].featured, true);
  assert.deepEqual(cleanMusicLibrary(empty), empty);
  assert.equal(musicLibraryStorageKey(), 'pikachu-music-library-v1'); assert.equal(musicLibraryStorageKey({ id: '12' }), 'pikachu-music-library-v1:12'); assert.equal(musicLibraryStorageKey({ id: '../bad' }), musicLibraryStorageKey());
});

test('invalid identities, duplicate playlists, collection bounds and excessive payloads fail before data is saved', () => {
  for (const bad of [null, {}, library([{}]), library([song(12, { source: 'bad' })]), library([song(12, { uid: 'qq-12' })]), library([song(12, { uid: 'netease-' })]), library([song(12, { uid: 'netease-\u0000' })]), library([song(12, { uid: 'netease-' + 'x'.repeat(260) })]), library([], [list([], '', '../bad')]), library([], [list(), list()]), library(Array.from({ length: 1001 }, (_, id) => song(id))), library([], Array.from({ length: 101 }, (_, id) => list([], 'name', 'pl-' + id))), library([], [list(null)])]) assert.throws(() => cleanMusicLibrary(bad));
  assert.throws(() => cleanMusicLibrary(library(Array.from({ length: 1000 }, (_, id) => song(id, { cover: 'https://example.com/' + 'x'.repeat(1000) })))), /1MB/);
  const value = cleanMusicLibrary(library([song(1, { cover: 'https://user:pass@example.com/a', qqIndex: -1 })], [list([], '  ')]));
  assert.equal(value.favorites[0].cover, undefined); assert.equal(value.favorites[0].qqIndex, undefined); assert.equal(value.playlists[0].name, '未命名歌单');
});

test('independent favorites and nested playlist edits merge, while removed songs and playlists stay removed', () => {
  const before = library([song(1)], [list([song(1), song(2)]), list([song(3)], '删除', 'pl-delete')]);
  const local = library([song(1), song(3)], [list([song(1), song(4)], '新名称'), list([song(3)], '本机改名', 'pl-delete')]);
  const remote = library([song(2)], [list([song(1), song(2), song(5)])]);
  const merged = mergeMusicLibraries(before, local, remote);
  assert.deepEqual(merged.favorites.map(item => item.songid), ['2', '3']);
  assert.equal(merged.playlists.length, 1); assert.equal(merged.playlists[0].name, '新名称');
  assert.deepEqual(new Set(merged.playlists[0].tracks.map(item => item.songid)), new Set(['1', '4', '5']));
  const named = mergeMusicLibraries(library([], [list()]), library([], [list()]), library([], [list([], '远端名称')]));
  assert.equal(named.playlists[0].name, '远端名称');
  assert.equal(mergeMusicLibraries(empty, library([], [list([], '新歌单')]), empty).playlists.length, 1);
});

test('playlist ordering persists across unrelated remote additions and conflict retries', () => {
  const before = library([], [list([song(1), song(2), song(3)])]);
  const local = library([], [list([song(3), song(1), song(2)])]);
  const remote = library([], [list([song(1), song(2), song(3), song(4)])]);
  const merged = mergeMusicLibraries(before, local, remote);
  assert.deepEqual(merged.playlists[0].tracks.map(item => item.songid), ['3', '1', '2', '4']);
  assert.deepEqual(mergeMusicLibraries(remote, merged, remote), merged);
  const inserted = mergeMusicLibraries(library([], [list([song(1), song(2)])]), library([], [list([song(1), song(3), song(2)])]), library([], [list([song(1), song(2), song(4)])]));
  assert.deepEqual(inserted.playlists[0].tracks.map(item => item.songid), ['1', '3', '2', '4']);
  assert.deepEqual(mergeRecords([{ id: 'a' }], [], [{ id: 'a', name: 'edit' }], item => item.id), []);
});
