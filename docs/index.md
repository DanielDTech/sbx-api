# sbx-api

`sbx-api` is the public HTTP API for sbx bookmarks. It is consumed by `sbx-web` and by
any other client that wants to read or write bookmarks. It has no human UI of its own:
every surface it exposes is an HTTP endpoint.

- Node >= 22, plain ES modules (`"type": "module"`), no build step and no bundler.
- Version `0.1.0`.
- Persistence is a single JSON file on disk.

## Endpoints

Every endpoint except `/health` requires the header `x-api-key`. A missing or unknown
key is a `401` for everything else, before any routing decision is made.

| Method | Path | Success | Other answers |
|---|---|---|---|
| GET | `/health` | `200` `{ ok: true }` | none; open to all, no key needed |
| GET | `/bookmarks?page=N` | `200` `{ items, page, pages, total }`, 10 per page | `401` without a valid key |
| GET | `/bookmarks/:id` | `200` one serialized bookmark | `404` if no such id |
| POST | `/bookmarks` | `201` the created bookmark | `422` `{ errors }` for an invalid body |
| DELETE | `/bookmarks/:id` | `204`, no body | `404` if no such id |

Anything else is a `404` if the path is not `/bookmarks` or `/bookmarks/:id`, and a
`405` if the path matches but the method does not. A request body that is not JSON is
treated as an invalid body, not as an exception: it parses to `null`, fails validation
and comes back as `422`.

### Bookmark shape

The public shape of a bookmark, and the only shape any client should rely on:

```json
{
  "id": 1,
  "title": "Example",
  "url": "https://example.com",
  "tags": ["web"],
  "createdAt": "2026-10-07T00:00:00.000Z"
}
```

`serializeBookmark` is what decides this shape. Fields stored but not listed here are
not part of the contract and are stripped on the way out.

## Areas

These four areas are **one area of ownership: the API**. They are small, they live in
one repository, and they change together; the split below is the code's own separation
of concerns, not four things with four owners.

### http — `src/http/server.js`, `src/http/list.js`

The HTTP surface.

`server.js` owns routing and every status code: `/health` open to all, the `401` for a
missing or wrong `x-api-key` on everything else, `GET /bookmarks` paginated,
`GET /bookmarks/:id`, `POST /bookmarks` answering `201` or the `422` that carries
`sbx-lib`'s validation errors, `DELETE /bookmarks/:id` answering `204` or `404`, the
`405` for a wrong method, and the rule that a body which is not JSON is invalid input
rather than a crash.

`list.js` owns two pure functions: `paginate`, which clamps the requested page into the
available range, and `serializeBookmark`, which decides the public shape of a bookmark.

### store — `src/store.js`

Persistence. `createStore(file)` reads the JSON file once at startup (or starts from
`{ nextId: 1, bookmarks: [] }` if it does not exist) and writes it on every change. It
owns the incrementing `nextId` and the `list`, `get`, `add` and `remove` operations.
Durability across a restart is this area's responsibility and nobody else's.

### auth — `src/auth.js`

API key authorization. `apiKeys` reads `SBX_API_KEYS` as a comma separated list and
falls back to the single key `dev-key` when it is unset. `isAuthorized` checks the
`x-api-key` request header against that list. It decides nothing about status codes;
`server.js` turns a `false` into a `401`.

### process entry — `bin/start.js`

Reads `PORT` and `SBX_DATA_FILE`, builds the store and the key list, and listens.
Configuration lives only here: nothing deeper in the tree reads `process.env` except
`apiKeys`, which takes its environment as an argument.

## Build, run and test

There is no build step.

```sh
npm install                 # install sbx-lib and sbx-core from GitHub
npm start                   # node bin/start.js
npm test                    # node --test
```

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4600` | port the API listens on |
| `SBX_DATA_FILE` | `data/bookmarks.json` | JSON file the store reads and writes |
| `SBX_API_KEYS` | `dev-key` | comma separated list of accepted `x-api-key` values |

CI is `.github/workflows/ci.yml`: on every push to `main` and on every pull request it
checks out the repository, sets up Node 22, and runs `npm install` and then `npm test`
on `ubuntu-latest`. That is the whole pipeline; there is no lint, type-check or build
job.

## Delivery platform

sbx-api is delivered as an HTTP API consumed by other clients. It has no human surface
of its own, so nobody will notice a regression by looking at it. Its validation is
therefore exactly two things: its own tests, and the consumers that call it. A change to
a status code, to the bookmark shape, or to pagination is a change to somebody else's
contract, and `sbx-web` is the first consumer that will feel it.

## Dependencies and what they own

This table exists so nobody writes a test here for behaviour this repository does not
own.

| Dependency | Pin | Owns | What this repository tests |
|---|---|---|---|
| `sbx-lib` | `github:DanielDTech/sbx-lib#v0.1.1` | the bookmark validation rules behind the `422` response (`validateBookmark`) | that an invalid body yields `422` and that `check.errors` is passed through unchanged. Never re-test the individual rules; they belong to `sbx-lib` |
| `sbx-core` | `github:DanielDTech/sbx-core#v1.0.0` | expected to own url normalization via `normalizeUrl`, used on create. **MISSING — see Local environment** | that create calls it. Nothing is known about its behaviour beyond that one call, so its normalization rules are its own to test, not this repository's |
| `node:http`, `node:fs`, `node:path` | Node's own | the http server, file IO and path handling | nothing; these are the platform |

`sbx-core` is used in exactly one place: `src/http/server.js` line 3 imports
`normalizeUrl` from it, and line 40 calls it on `POST /bookmarks`. That single import is
the only use of `sbx-core` anywhere in the repository.

## Local environment

### Intended commands

```sh
npm install
npm test
PORT=4600 SBX_DATA_FILE=data/bookmarks.json npm start

curl http://localhost:4600/health
curl -H 'x-api-key: dev-key' http://localhost:4600/bookmarks
```

### The environment cannot currently be stood up

`npm install` fails, so nothing that needs the dependency tree can run. This is not a
local misconfiguration; it is the state of the repository.

`package.json` pins `"sbx-core": "github:DanielDTech/sbx-core#v1.0.0"`, and the
repository `DanielDTech/sbx-core` does not exist:

```
npm error code 128
npm error An unknown git error occurred
npm error command git --no-replace-objects ls-remote ssh://git@github.com/DanielDTech/sbx-core.git
npm error ERROR: Repository not found.
npm error fatal: Could not read from remote repository.
```

Because the install fails as a whole, no `node_modules` is produced at all, and
`npm test` cannot pass. `test/server.test.js` dies on import before a single assertion
runs:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'sbx-lib' imported from src/http/server.js
    code: 'ERR_MODULE_NOT_FOUND'
✖ test/server.test.js
ℹ tests 11
ℹ pass 10
ℹ fail 1
```

The error names `sbx-lib` only because it is the first bare import in `server.js` and the
failed install left no packages installed whatsoever. The root cause is the missing
`sbx-core`. CI on this repository is red for the same reason, on `main` and on any
branch, at the `npm install` step.

**Not exercisable.** The entire HTTP surface. The server cannot be started at all, so
none of this can be checked:

- `/health` and the `401` on everything else — auth enforcement end to end
- pagination over HTTP, including the page clamp and non-numeric `page` values
- create (`201`), validation pass-through (`422`), and the not-JSON body path
- delete (`204` / `404`), `404` for unknown paths, `405` for wrong methods
- the whole of `sbx-web`'s end-to-end path against a real API
- `npm start`, and anything involving `PORT` or `SBX_DATA_FILE`

**Still exercisable.** The store, auth and list unit tests, which import no bare
specifiers and so need no `node_modules`:

```sh
node --test test/store.test.js test/auth.test.js test/list.test.js
```

Confirmed passing on 2026-10-07: 10 tests, 10 pass, 0 fail. These cover persistence
across a reload, `nextId`, `remove`'s return value, key parsing, header checking,
pagination and serialization.

### What would unblock it

Exactly one of:

1. The repository `DanielDTech/sbx-core` is created and tagged `v1.0.0`, exporting
   `normalizeUrl`.
2. A human decides `normalizeUrl` moves into `sbx-lib`, and `sbx-api` is repointed at
   it. That is a change to a shared dependency and needs its own ticket.

Both options are outside this repository. Nothing in the three sbx repositories provides
`normalizeUrl` today, and `sbx-core` is outside the sbx project's scope. Do not create
`sbx-core` here, do not vendor or reimplement `normalizeUrl`, and do not patch around
the missing dependency: a shared dependency is never patched locally.
