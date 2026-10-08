# sbx-api

Public HTTP API for sbx bookmarks, for any client.

## Authentication

Every endpoint except `/health` needs the header `x-api-key`. Keys come from `SBX_API_KEYS` (comma separated); without it the only key is `dev-key`.

## Endpoints

| Method | Path | Answer |
|---|---|---|
| GET | `/health` | `{ ok: true }` |
| GET | `/bookmarks?page=N` | `{ items, page, pages, total }`, 10 per page |
| GET | `/bookmarks/:id` | one bookmark, or 404 |
| POST | `/bookmarks` | body `{ title, url, tags, note }`, `note` optional; 201 with the bookmark, 422 with `{ errors }` |
| DELETE | `/bookmarks/:id` | 204, or 404 |

A bookmark is `{ id, title, url, tags, createdAt }`, plus `note` when it was created
with one; urls are normalized. A `note` is optional, is kept exactly as sent, and is
refused with a `422` past 500 code units.

## Running

`npm install`, then `npm start` (port `PORT`, default 4600; data in `SBX_DATA_FILE`, default `data/bookmarks.json`). Tests: `npm test`.
