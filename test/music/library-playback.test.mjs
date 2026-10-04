import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../../source/music/index.html', import.meta.url), 'utf8');
const functions = (start, end) => {
  const first = html.indexOf('    function ' + start + '(');
  const last = html.indexOf('    function ' + end + '(');
  assert.ok(first >= 0 && last > first, 'The regression must execute the real player functions.');
  return html.slice(first, last);
};
const source = functions('serializeTrack', 'getLibrarySnapshot')
  + functions('applyLibrary', 'loadLibraryFromStorage')
  + functions('getActiveList', 'handlePlaybackFailure');
const track = id => ({ uid: 'netease-' + id, source: 'netease', songid: id, title: id });
const library = ids => ({ favorites: ids.map(track), playlists: [{ id: 'pl-test', name: 'Test', tracks: ids.map(track) }] });

function player(type, current = 'B', ids = ['A', 'B', 'C', 'D']) {
  const initial = library(ids); const played = [];
  const state = {
    ...initial, currentTrack: track(current), trackMap: new Map(), playMode: 'list',
    playContext: { type, index: ids.indexOf(current), playlistId: type === 'playlist' ? 'pl-test' : null, queueUids: ids.map(id => track(id).uid) },
  };
  const context = {
    state, dom: { playlistSelect: { value: 'pl-test' } },
    renderPlaylistOptions() {}, updateMainFavButton() {}, renderPlaylistList() {},
    getInterleavedSearchList: () => [track('search')],
    playTrack(value) { state.currentTrack = value; played.push(value.uid); },
    showToast() {}, t: value => value,
  };
  vm.createContext(context); vm.runInContext(source, context);
  return { state, played, apply: context.applyLibrary, next: context.playNext, list: context.getActiveList, playFromList: context.playFromList };
}

for (const type of ['favorites', 'playlist']) {
  test(type + ': deleting before the current track preserves next and previous navigation', () => {
    const value = player(type, 'C'); value.apply(library(['B', 'C', 'D']));
    assert.equal(value.state.playContext.index, 1);
    value.next('next'); assert.deepEqual(value.played, ['netease-D']);
    value.next('prev'); assert.equal(value.played.at(-1), 'netease-C');
  });

  test(type + ': deleting after the current track and reordering follow the new queue', () => {
    const value = player(type); value.apply(library(['A', 'B', 'D']));
    value.next('next'); assert.equal(value.played.at(-1), 'netease-D');
    value.apply(library(['D', 'B', 'A']));
    value.next('next'); assert.equal(value.played.at(-1), 'netease-B');
  });

  test(type + ': a removed current song finishes and advances to the surviving old neighbor', () => {
    const next = player(type); next.apply(library(['A', 'X', 'C', 'D']));
    assert.equal(next.state.currentTrack.uid, 'netease-B');
    next.next('next'); assert.equal(next.played.at(-1), 'netease-C');
    const previous = player(type); previous.apply(library(['A', 'X', 'C', 'D']));
    previous.next('prev'); assert.equal(previous.played.at(-1), 'netease-A');
  });

  test(type + ': repeated updates after removing the current track retain its queue gap', () => {
    const value = player(type); value.apply(library(['A', 'C', 'D']));
    value.apply(library(['A', 'D']));
    value.next('next'); assert.equal(value.played.at(-1), 'netease-D');
  });

  test(type + ': local removal before applying a saved library uses the playback queue snapshot', () => {
    for (const removed of ['A', 'B']) {
      const value = player(type);
      const list = type === 'favorites' ? value.state.favorites : value.state.playlists[0].tracks;
      list.splice(list.findIndex(item => item.uid === track(removed).uid), 1);
      value.apply({ favorites: value.state.favorites, playlists: value.state.playlists });
      value.next('next'); assert.equal(value.played.at(-1), 'netease-C');
    }
  });

  test(type + ': starting a library song captures its queue independently from array mutation', () => {
    const value = player(type);
    value.playFromList(type, 1, type === 'playlist' ? 'pl-test' : null);
    assert.deepEqual(Array.from(value.state.playContext.queueUids), ['netease-A', 'netease-B', 'netease-C', 'netease-D']);
    value.list().shift();
    assert.equal(value.state.playContext.queueUids[0], 'netease-A');
  });

  test(type + ': removed last song wraps, entirely replaced queue starts with its first song', () => {
    const last = player(type, 'D'); last.apply(library(['A', 'B', 'C']));
    last.next('next'); assert.equal(last.played.at(-1), 'netease-A');
    const replaced = player(type); replaced.apply(library(['X', 'Y']));
    replaced.next('next'); assert.equal(replaced.played.at(-1), 'netease-X');
    const empty = player(type); empty.apply(library([]));
    empty.next('next'); assert.deepEqual(empty.played, []);
  });

  test(type + ': account scope switches detach the previous queue, including matching song and playlist IDs', () => {
    const value = player(type); value.apply(library(['A', 'B', 'C']), { scopeChanged: true });
    assert.equal(value.state.currentTrack.uid, 'netease-B');
    assert.equal(value.state.playContext.type, 'standalone');
    value.next('next'); value.next('prev'); assert.deepEqual(value.played, []);
    assert.equal(value.list().length, 0);
  });
}

test('deleting the active playlist detaches it without continuing search results', () => {
  const value = player('playlist'); value.apply({ favorites: [], playlists: [] });
  assert.equal(value.state.playContext.type, 'standalone');
  value.next('next'); assert.deepEqual(value.played, []);
});

test('switching accounts preserves public search and featured queues', () => {
  for (const type of ['results', 'featured']) {
    const value = player(type); value.apply(library([]), { scopeChanged: true });
    assert.equal(value.state.playContext.type, type);
  }
});
