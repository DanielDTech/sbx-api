# Releasing sbx-api

**There is nothing to release.** This repository has no release process.

That is the honest state of it, not an omission from this document. Concretely, as of
2026-10-07:

- No registry package. `package.json` has no `publishConfig`, no `files` field and no
  `prepublish`/`prepack` script, and nothing publishes to npm or to any other registry.
- No tag convention in use. The repository has no tags. The three commits on `main` are
  plain commits.
- Version `0.1.0` in `package.json`, unchanged since the first commit. No `npm version`
  step, no changelog.
- No deploy target. There is no `Dockerfile`, no container build, no hosting or platform
  configuration (no Procfile, no systemd unit, no Terraform, no Kubernetes manifests,
  no fly/render/vercel config), and no secrets or environment wiring for a deployed
  instance.
- The only automation is `.github/workflows/ci.yml`, which runs `npm install` and
  `npm test` on Node 22 for every push to `main` and every pull request. It tests; it
  does not build, publish or deploy anything.

Consumers get this code the way `package.json` pins its own dependencies: as a git
reference to this repository. Today that means a consumer would point at a commit or at
`main`.

## What releasing would require

Someone would first have to decide what "released" means for an HTTP API: a published
package, a tagged git reference, a container image, or a running deployment. Each needs
its own decision and its own work, none of which exists here:

- a decision on the distribution form, and an owner for it
- a tag convention, and the versioning policy behind it, since the version has never
  moved off `0.1.0`
- for a deployment: a target, a container or process definition, and configuration for
  `PORT`, `SBX_DATA_FILE` and `SBX_API_KEYS`, plus a decision about the data file, which
  is local disk state that no stateless deploy target preserves
- a workflow to do it, since CI runs tests only

None of that should be invented in passing. It is a decision for a human, and it needs
its own ticket.

## The tree itself is not the obstacle

Nothing about the build stands in the way. `npm install` resolves both git dependencies,
`npm test` passes in full — 28 tests, 28 pass, 0 fail — and `npm start` serves the whole
HTTP surface. What is missing is a release process, not a working tree. See the Local
environment section of [index.md](./index.md) for the exact commands.
