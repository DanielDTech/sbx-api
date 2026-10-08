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
| `sbx-lib` | `github:DanielDTech/sbx-lib#v0.1.2` | the bookmark validation rules behind the `422` response (`validateBookmark`) | that an invalid body yields `422` and that `check.errors` is passed through unchanged. Never re-test the individual rules; they belong to `sbx-lib` |
| `sbx-core` | `github:DanielDTech/sbx-core#v1.0.0` | url normalization via `normalizeUrl`, used on create. In its own words: "lowercase host, no default port, no fragment, no bare trailing slash" | that create calls it and stores what it returns. Never the normalization rules themselves: `sbx-core` is maintained outside the sbx project and tests its own behaviour |
| `node:http`, `node:fs`, `node:path` | Node's own | the http server, file IO and path handling | nothing; these are the platform |

`sbx-core` is used in exactly one place: `src/http/server.js` line 3 imports
`normalizeUrl` from it, and line 40 calls it on `POST /bookmarks`. That single import is
the only use of `sbx-core` anywhere in the repository.

`sbx-core` is maintained outside the sbx project. Its own README says so, and says what
it owns: lowercasing the host, dropping a default port, dropping the fragment and
dropping a bare trailing slash. Those rules are its to test, not this repository's. The
line this repository draws is the same one it draws for `sbx-lib`: assert that create
calls `normalizeUrl` and stores whatever it returns, and stop there. A test here that
pinned down, say, which ports count as default would be a test of somebody else's code,
and it would break when they legitimately change it.

## Local environment

The environment stands up. `npm install` resolves both git dependencies and `npm test`
passes in full.

### Commands

```sh
npm install                 # resolves sbx-lib and sbx-core from GitHub
npm test                    # node --test: 28 tests, 28 pass, 0 fail
```

Confirmed on 2026-10-07 on Node v24.21.0: 28 tests, 28 pass, 0 fail. The suite is the
five test files together — `test/store.test.js`, `test/auth.test.js`,
`test/list.test.js`, `test/server.test.js` and `test/pagination.test.js`. Run
`npm test`; there is no reason to name files individually.

To run the server, set the three environment variables, or let them default:

```sh
PORT=4600 SBX_DATA_FILE=/tmp/sbx-api-demo.json SBX_API_KEYS=e2e-key npm start
# logs: sbx-api on http://localhost:4600
```

`PORT` defaults to `4600`, `SBX_DATA_FILE` to `data/bookmarks.json` and `SBX_API_KEYS`
to the single key `dev-key`. Point `SBX_DATA_FILE` at a throwaway file under `/tmp`, as
above, so a local poke-around never writes into the repository's own `data` directory.

### A worked sequence against a running server

With the server started exactly as above, these six calls cover the whole surface. Every
request and every response below was run and copied from a real server.

`/health` is open; it needs no key:

```sh
$ curl -s http://localhost:4600/health
{"ok":true}
```

Everything else needs the key. Without it, a `401`, before any routing:

```sh
$ curl -s http://localhost:4600/bookmarks
{"error":"missing or wrong x-api-key"}
```

Create. Note the url going in and the url coming back: `normalizeUrl` lowercased the
host, dropped the default port `:443` and dropped the `#frag` fragment:

```sh
$ curl -s -X POST http://localhost:4600/bookmarks \
    -H 'x-api-key: e2e-key' -H 'content-type: application/json' \
    -d '{"title":"Example","url":"https://EXAMPLE.com:443/#frag","tags":["web"]}'
{"id":1,"title":"Example","url":"https://example.com","tags":["web"],"createdAt":"2026-10-07T19:33:20.755Z"}
```

An invalid body is a `422` carrying `sbx-lib`'s errors unchanged:

```sh
$ curl -s -X POST http://localhost:4600/bookmarks \
    -H 'x-api-key: e2e-key' -H 'content-type: application/json' \
    -d '{"title":"","url":"nope"}'
{"errors":["title is required","url must start with http:// or https://"]}
```

The list is the paginated envelope:

```sh
$ curl -s http://localhost:4600/bookmarks -H 'x-api-key: e2e-key'
{"items":[{"id":1,"title":"Example","url":"https://example.com","tags":["web"],"createdAt":"2026-10-07T19:33:20.755Z"}],"page":1,"pages":1,"total":1}
```

Delete answers `204` with no body:

```sh
$ curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:4600/bookmarks/1 \
    -H 'x-api-key: e2e-key'
204
```

Afterwards, stop the server and delete the throwaway file.

### Everything is exercisable in isolation

The API's own tests start a real HTTP server on an ephemeral port against a temporary
data file: `test/server.test.js` calls `server.listen(0, ...)` and points `createStore`
at a file inside a fresh `mkdtempSync` directory. So whoever owns this code can exercise
every pathway — auth enforcement, pagination, create, the `422`, the not-JSON body,
delete, the `404` and the `405` — with nothing else running and no network. No other sbx
repository needs to be up, no particular port needs to be free, and no state is shared
between tests or left behind afterwards.

The end-to-end path through a consumer also works: `sbx-web` pointed at a running
`sbx-api` renders the real list and its add form writes through. That is worth doing
before changing a status code or the bookmark shape, but it is not needed to exercise
this repository's own behaviour.
