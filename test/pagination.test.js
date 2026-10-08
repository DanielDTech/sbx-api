import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { createServer } from '../src/http/server.js';
import { paginate } from '../src/http/list.js';

const itemsWithIds = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
const idsUpTo = (count) => Array.from({ length: count }, (_, index) => index + 1);
const idsOf = (page) => page.items.map((item) => item.id);

function idsCollectedByWalkingEveryPage(items, size) {
  const { pages } = paginate(items, 1, size);
  const collected = [];
  for (let page = 1; page <= pages; page += 1) collected.push(...idsOf(paginate(items, page, size)));
  return collected;
}

function pageSizesAcrossEveryPage(items, size) {
  const { pages } = paginate(items, 1, size);
  return Array.from({ length: pages }, (_, index) => paginate(items, index + 1, size).items.length);
}

async function withServer(fn) {
  const store = createStore(join(mkdtempSync(join(tmpdir(), 'sbx-api-pagination-')), 'b.json'));
  const server = createServer({ store, keys: ['k'] });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, store); } finally { server.close(); }
}

const authed = { 'x-api-key': 'k', 'content-type': 'application/json' };

const storeBookmarks = (store, count) => {
  for (let index = 1; index <= count; index += 1) store.add({ title: `Bookmark ${index}`, url: 'https://example.com', tags: [] });
};

const listPage = async (base, page) => (await fetch(`${base}/bookmarks?page=${page}`, { headers: authed })).json();

test('a last page whose total divides evenly by the page size is a full page', () => {
  assert.deepEqual(idsOf(paginate(itemsWithIds(20), 2, 10)), idsUpTo(20).slice(10));
});

test('a single page holding exactly the page size keeps every item', () => {
  const result = paginate(itemsWithIds(10), 1, 10);
  assert.deepEqual(idsOf(result), idsUpTo(10));
  assert.equal(result.pages, 1);
});

test('walking every page yields each id exactly once at any total', () => {
  for (const count of [1, 9, 10, 11, 19, 20, 21, 30]) {
    assert.deepEqual(idsCollectedByWalkingEveryPage(itemsWithIds(count), 10), idsUpTo(count), `total ${count}`);
  }
});

test('walking every page loses nothing at a page size other than the production one', () => {
  assert.deepEqual(pageSizesAcrossEveryPage(itemsWithIds(9), 3), [3, 3, 3]);
  assert.deepEqual(idsCollectedByWalkingEveryPage(itemsWithIds(9), 3), idsUpTo(9));
});

test('a total that leaves a remainder gives full pages and then the remainder', () => {
  assert.deepEqual(pageSizesAcrossEveryPage(itemsWithIds(25), 10), [10, 10, 5]);
  assert.equal(paginate(itemsWithIds(25), 1, 10).pages, 3);
});

test('an empty list is one empty page', () => {
  assert.deepEqual(paginate([], 1, 10), { items: [], page: 1, pages: 1, total: 0 });
});

test('a page below one or past the end resolves into the available range', () => {
  const items = itemsWithIds(20);
  assert.equal(paginate(items, 0, 10).page, 1);
  assert.equal(paginate(items, -1, 10).page, 1);
  assert.equal(paginate(items, 99, 10).page, 2);
  assert.equal(paginate(items, 99, 10).items.length, 10);
});

test('the list response reaches the highest bookmark when the stored count divides evenly', () => withServer(async (base, store) => {
  storeBookmarks(store, 20);
  const response = await fetch(`${base}/bookmarks?page=2`, { headers: authed });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 10);
  assert.equal(body.items.at(-1).id, 20);
  assert.equal(body.total, 20);
}));

test('the list response total is the stored count on every page, not the page length', () => withServer(async (base, store) => {
  storeBookmarks(store, 20);
  for (const page of [1, 2]) {
    const body = await listPage(base, page);
    assert.equal(typeof body.total, 'number');
    assert.equal(body.total, 20);
  }
}));

test('the list response carries exactly items, page, pages and total', () => withServer(async (base, store) => {
  storeBookmarks(store, 20);
  const body = await listPage(base, 2);
  assert.deepEqual(Object.keys(body).sort(), ['items', 'page', 'pages', 'total']);
}));

test('a stored count of exactly one page is one full page over real http', () => withServer(async (base, store) => {
  storeBookmarks(store, 10);
  const response = await fetch(`${base}/bookmarks?page=1`, { headers: authed });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items.length, 10);
  assert.equal(body.pages, 1);
  assert.equal(body.total, 10);
}));
