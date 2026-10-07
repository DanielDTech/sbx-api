import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function createStore(file) {
  let state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { nextId: 1, bookmarks: [] };
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2));
  };
  return {
    list: () => [...state.bookmarks],
    get: (id) => state.bookmarks.find((b) => b.id === id) ?? null,
    add(fields, now = new Date()) {
      const bookmark = { id: state.nextId++, ...fields, createdAt: now.toISOString() };
      state.bookmarks.push(bookmark);
      save();
      return bookmark;
    },
    remove(id) {
      const before = state.bookmarks.length;
      state = { ...state, bookmarks: state.bookmarks.filter((b) => b.id !== id) };
      if (state.bookmarks.length === before) return false;
      save();
      return true;
    },
  };
}
