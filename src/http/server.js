import { createServer as createHttpServer } from 'node:http';
import { validateBookmark } from 'sbx-lib';
import { normalizeUrl } from 'sbx-core';
import { isAuthorized } from '../auth.js';
import { paginate, serializeBookmark } from './list.js';

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const readJson = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    try { resolve(JSON.parse(data || '{}')); } catch { resolve(null); }
  });
});

export function createServer({ store, keys, pageSize = 10 }) {
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (!isAuthorized(req.headers, keys)) return send(res, 401, { error: 'missing or wrong x-api-key' });
    const match = url.pathname.match(/^\/bookmarks(?:\/(\d+))?$/);
    if (!match) return send(res, 404, { error: 'not found' });
    const id = match[1] ? Number(match[1]) : null;
    if (req.method === 'GET' && id === null) {
      const result = paginate(store.list(), Number(url.searchParams.get('page')) || 1, pageSize);
      return send(res, 200, { ...result, items: result.items.map(serializeBookmark) });
    }
    if (req.method === 'GET') {
      const bookmark = store.get(id);
      return bookmark ? send(res, 200, serializeBookmark(bookmark)) : send(res, 404, { error: 'not found' });
    }
    if (req.method === 'POST' && id === null) {
      const body = await readJson(req);
      const check = validateBookmark(body);
      if (!check.ok) return send(res, 422, { errors: check.errors });
      const bookmark = store.add({ title: body.title.trim(), url: normalizeUrl(body.url), tags: body.tags ?? [] });
      return send(res, 201, serializeBookmark(bookmark));
    }
    if (req.method === 'DELETE' && id !== null) return store.remove(id) ? send(res, 204) : send(res, 404, { error: 'not found' });
    return send(res, 405, { error: 'method not allowed' });
  });
}
