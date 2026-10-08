import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { createServer } from '../src/http/server.js';

async function withServer(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'sbx-api-'));
  const store = createStore(join(directory, 'b.json'));
  const server = createServer({ store, keys: ['k'] });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, store); } finally { server.close(); rmSync(directory, { recursive: true, force: true }); }
}
const authed = { 'x-api-key': 'k', 'content-type': 'application/json' };

test('health needs no key, bookmarks do', () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/bookmarks`)).status, 401);
}));

test('a valid bookmark is created with its url normalized', () => withServer(async (base) => {
  const res = await fetch(`${base}/bookmarks`, { method: 'POST', headers: authed, body: JSON.stringify({ title: 'A', url: 'HTTPS://Example.com/#x', tags: ['web'] }) });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).url, 'https://example.com');
}));

test('an invalid bookmark or a body that is not JSON gets 422', () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/bookmarks`, { method: 'POST', headers: authed, body: JSON.stringify({ title: '' }) })).status, 422);
  assert.equal((await fetch(`${base}/bookmarks`, { method: 'POST', headers: authed, body: '{not json' })).status, 422);
}));

test('the list is paginated and a page that is not a number means page 1', () => withServer(async (base, store) => {
  for (let i = 0; i < 3; i++) store.add({ title: `t${i}`, url: 'https://a.com', tags: [] });
  const body = await (await fetch(`${base}/bookmarks?page=abc`, { headers: authed })).json();
  assert.equal(body.page, 1);
  assert.equal(body.items.length, 3);
}));

test('a deleted bookmark is gone', () => withServer(async (base, store) => {
  const b = store.add({ title: 't', url: 'https://a.com', tags: [] });
  assert.equal((await fetch(`${base}/bookmarks/${b.id}`, { method: 'DELETE', headers: authed })).status, 204);
  assert.equal((await fetch(`${base}/bookmarks/${b.id}`, { headers: authed })).status, 404);
}));

test('a url the URL parser rejects gets 422 and the API stays up', () => withServer(async (base) => {
  const res = await fetch(`${base}/bookmarks`, { method: 'POST', headers: authed, body: JSON.stringify({ title: 'A', url: 'http://a:99999' }) });
  assert.equal(res.status, 422);
  assert.equal((await fetch(`${base}/health`)).status, 200);
}));

test('a fractional page is read as its whole page', () => withServer(async (base, store) => {
  for (let i = 0; i < 12; i++) store.add({ title: `t${i}`, url: 'https://a.com', tags: [] });
  const body = await (await fetch(`${base}/bookmarks?page=1.5`, { headers: authed })).json();
  assert.equal(body.page, 1);
  assert.equal(body.items[0].id, 1);
}));
