import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('music and video ship the same public account and synchronization modules', async () => {
  for (const file of ['account-client.js', 'sync-data.js', 'music-library.js', 'music-account.js']) {
    const music = await readFile(new URL('../source/music/shared/' + file, import.meta.url), 'utf8');
    const video = await readFile(new URL('../source/video/shared/' + file, import.meta.url), 'utf8');
    assert.equal(music, video, 'Shared module drift: ' + file);
  }
});
