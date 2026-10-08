import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { createServer } from '../src/http/server.js';
import { serializeBookmark } from '../src/http/list.js';

async function withDataFile(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'sbx-api-note-'));
  try { return await fn(join(directory, 'bookmarks.json')); } finally { rmSync(directory, { recursive: true, force: true }); }
}

async function withServer(fn, initialState) {
  return withDataFile(async (file) => {
    if (initialState !== undefined) writeFileSync(file, JSON.stringify(initialState));
    const server = createServer({ store: createStore(file), keys: ['k'] });
    await new Promise((resolve) => server.listen(0, resolve));
    try { await fn(`http://127.0.0.1:${server.address().port}`, file); } finally { server.close(); }
  });
}

const authed = { 'x-api-key': 'k', 'content-type': 'application/json' };
const create = (base, body) => fetch(`${base}/bookmarks`, { method: 'POST', headers: authed, body: JSON.stringify(body) });
const createdBody = async (base, body) => (await create(base, body)).json();
const listAll = async (base) => (await fetch(`${base}/bookmarks`, { headers: authed })).json();
const readOne = async (base, id) => (await fetch(`${base}/bookmarks/${id}`, { headers: authed })).json();
const noteOf = (length) => 'n'.repeat(length);
const sortedKeys = (object) => Object.keys(object).sort();
const publicKeys = ['createdAt', 'id', 'tags', 'title', 'url'];
const publicKeysWithNote = ['createdAt', 'id', 'note', 'tags', 'title', 'url'];
const storedRecord = { title: 'A', url: 'https://a.com', tags: [] };

test('serializeBookmark carries a stored note and omits it when the record has none', () => {
  const record = { id: 1, title: 't', url: 'https://a.com', tags: ['x'], createdAt: '2026-10-07T00:00:00.000Z', secret: 1 };
  const withNote = serializeBookmark({ ...record, note: 'kept' });
  assert.deepEqual(sortedKeys(withNote), publicKeysWithNote);
  assert.equal(withNote.note, 'kept');
  assert.equal(Object.hasOwn(withNote, 'secret'), false);
  const withoutNote = serializeBookmark(record);
  assert.deepEqual(sortedKeys(withoutNote), publicKeys);
  assert.equal(Object.hasOwn(withoutNote, 'secret'), false);
});

test('serializeBookmark creates no note key at all for a record without one', () => {
  const serialized = serializeBookmark({ id: 1, title: 't', url: 'https://a.com', tags: [], createdAt: '2026-10-07T00:00:00.000Z' });
  assert.equal(Object.keys(serialized).length, 5);
  assert.equal(Object.hasOwn(serialized, 'note'), false);
  assert.equal(Object.values(serialized).some((value) => value === undefined), false);
});

test('a create carrying a note answers 201 with the identical string', () => withServer(async (base) => {
  const note = noteOf(200);
  const response = await create(base, { ...storedRecord, note });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.note, note);
}));

test('a create with no note field answers 201 and its response carries no note key', () => withServer(async (base) => {
  const response = await create(base, storedRecord);
  assert.equal(response.status, 201);
  assert.equal(Object.hasOwn(await response.json(), 'note'), false);
}));

test('an empty note is kept and stays distinguishable from no note at all', () => withServer(async (base) => {
  const empty = await create(base, { ...storedRecord, note: '' });
  assert.equal(empty.status, 201);
  const emptyBody = await empty.json();
  assert.equal(Object.hasOwn(emptyBody, 'note'), true);
  assert.equal(emptyBody.note, '');
  const absent = await createdBody(base, { title: 'B', url: 'https://b.com', tags: [] });
  assert.equal(Object.hasOwn(absent, 'note'), false);
}));

test('a whitespace note is kept untrimmed', () => withServer(async (base) => {
  const note = ' '.repeat(10);
  const response = await create(base, { ...storedRecord, note });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).note, note);
}));

test('a note over the ceiling and a note that is not text are refused and store nothing', () => withServer(async (base) => {
  const before = (await listAll(base)).total;
  const tooLong = await create(base, { ...storedRecord, note: noteOf(501) });
  assert.equal(tooLong.status, 422);
  assert.deepEqual((await tooLong.json()).errors, ['note is longer than 500 characters']);
  const notText = await create(base, { ...storedRecord, note: null });
  assert.equal(notText.status, 422);
  assert.deepEqual((await notText.json()).errors, ['note must be text']);
  assert.equal((await listAll(base)).total, before);
}));

test('a note created over the api survives a reload of the same data file', () => withServer(async (base, file) => {
  const note = 'kept across a reload';
  const created = await createdBody(base, { ...storedRecord, note });
  assert.equal(createStore(file).get(created.id).note, note);
}));

test('a bookmark stored before notes existed reads back with no note key', () => withServer(async (base) => {
  const body = await readOne(base, 1);
  assert.equal(body.title, 'Stored before notes');
  assert.equal(Object.hasOwn(body, 'note'), false);
}, { nextId: 2, bookmarks: [{ id: 1, title: 'Stored before notes', url: 'https://old.com', tags: [], createdAt: '2026-10-01T00:00:00.000Z' }] }));

test('the list envelope is unchanged and each item carries a note only if it was created with one', () => withServer(async (base) => {
  const withNote = await createdBody(base, { ...storedRecord, note: 'n' });
  const withoutNote = await createdBody(base, { title: 'B', url: 'https://b.com', tags: [] });
  const body = await listAll(base);
  assert.deepEqual(sortedKeys(body), ['items', 'page', 'pages', 'total']);
  const itemWithId = (id) => body.items.find((item) => item.id === id);
  assert.deepEqual(sortedKeys(itemWithId(withNote.id)), publicKeysWithNote);
  assert.deepEqual(sortedKeys(itemWithId(withoutNote.id)), publicKeys);
}));

test('a note of exactly the ceiling is accepted and is not shortened', () => withServer(async (base, file) => {
  const note = noteOf(500);
  const response = await create(base, { ...storedRecord, note });
  assert.equal(response.status, 201);
  const serialized = await response.json();
  assert.equal(serialized.note, note);
  assert.equal(serialized.note.length, 500);
  assert.equal(createStore(file).get(serialized.id).note.length, 500);
}));

test('a note of 250 two-unit emoji round trips with its code unit length intact', () => withServer(async (base, file) => {
  const note = '\u{1F600}'.repeat(250);
  assert.equal(note.length, 500);
  const created = await createdBody(base, { ...storedRecord, note });
  assert.equal(created.note, note);
  const reloaded = createStore(file).get(created.id);
  assert.equal(reloaded.note, note);
  assert.equal(reloaded.note.length, 500);
  assert.equal(serializeBookmark(reloaded).note, note);
  assert.equal(serializeBookmark(reloaded).note.length, 500);
}));
