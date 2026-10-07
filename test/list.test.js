import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, serializeBookmark } from '../src/http/list.js';

const items = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

test('the first page is a full page', () => {
  const result = paginate(items(25), 1, 10);
  assert.deepEqual(result.items.map((b) => b.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(result.pages, 3);
  assert.equal(result.total, 25);
});

test('the last page holds the remainder', () => {
  assert.deepEqual(paginate(items(25), 3, 10).items.map((b) => b.id), [21, 22, 23, 24, 25]);
});

test('a page past the end shows the last page', () => {
  assert.equal(paginate(items(25), 9, 10).page, 3);
});

test('an empty list is one empty page', () => {
  assert.deepEqual(paginate([], 1, 10), { items: [], page: 1, pages: 1, total: 0 });
});

test('serializeBookmark keeps only the public fields', () => {
  const b = { id: 1, title: 't', url: 'https://a.com', tags: ['x'], createdAt: '2026-10-07T00:00:00.000Z', secret: 1 };
  assert.deepEqual(serializeBookmark(b), { id: 1, title: 't', url: 'https://a.com', tags: ['x'], createdAt: '2026-10-07T00:00:00.000Z' });
});
