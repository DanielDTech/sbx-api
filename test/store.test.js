import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';

const temporaryDirectories = [];
const tempFile = () => {
  const directory = mkdtempSync(join(tmpdir(), 'sbx-store-'));
  temporaryDirectories.push(directory);
  return join(directory, 'data', 'bookmarks.json');
};

after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

test('added bookmarks get increasing ids and survive a reload', () => {
  const file = tempFile();
  const store = createStore(file);
  const first = store.add({ title: 'a', url: 'https://a.com', tags: [] }, new Date('2026-10-07T00:00:00Z'));
  store.add({ title: 'b', url: 'https://b.com', tags: [] });
  assert.equal(first.id, 1);
  assert.equal(first.createdAt, '2026-10-07T00:00:00.000Z');
  assert.deepEqual(createStore(file).list().map((b) => b.id), [1, 2]);
});

test('remove reports whether anything was removed', () => {
  const store = createStore(tempFile());
  const b = store.add({ title: 'a', url: 'https://a.com', tags: [] });
  assert.equal(store.remove(b.id), true);
  assert.equal(store.remove(b.id), false);
  assert.equal(store.get(b.id), null);
});
