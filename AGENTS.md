# AGENTS.md

## Commands

```bash
bun test                          # tests (test/query.test.ts)
sst dev                           # local Cloudflare simulation (via `bun run dev`)
sst deploy                        # deploy to Cloudflare (via `bun run deploy`)
sst build                         # build SST app (note: NOT the frontend build)

# Frontend (separate package, must be built before SST serves new assets)
( cd packages/web && bun run build )   # vite build → packages/web/dist

# Snapshot generation → snapshot.ndjson (top PyPI packages by 30-day downloads)
bun scripts/build-snapshot.ts
```

No `lint` or `typecheck` scripts are configured; `bun test` is the only verification. To typecheck manually: `bunx tsc --noEmit`.

## SST dev requirements

`sst dev` provisions `pypi.pro` on Cloudflare. Prerequisites:

1. `CLOUDFLARE_API_TOKEN` env var set, or SST prompts for interactive login on first run
2. `pypi.pro` added to your Cloudflare account with DNS control
3. First run creates `.sst/` state dir

## D1 database

D1 (Cloudflare SQLite). Binding name in `sst.config.ts`: `pypi-search-db` (resource `SearchDB`). Schema in `schema.sql`:

- `packages` — main table, ranked by `downloads_4w DESC`
- `pkg_prefix` — FTS5 external-content table, `prefix='2 3 4'`
- `pkg_trigram` — FTS5 trigram table for fuzzy fallback

Initialize / reset schema:

```bash
bunx wrangler d1 execute pypi-search-db --file=schema.sql
```

FTS tables are external-content (`content='packages'`); there are no triggers. Inserts into `packages` must be followed by explicit FTS sync calls (see `ingest` in `src/search.ts`).

## Architecture

Infrastructure: D1 + Workers + R2 (`Snapshots` bucket) + Queue (`Ingest`). All wired in `sst.config.ts`.

Worker entry `src/worker.ts` routes:

- `GET  /api/search?q=` — search
- `POST /ingest`        — insert records (queue consumer path is `src/consumer.ts`)
- `POST /bootstrap`    — pull `snapshot.ndjson` from R2 `Snapshots` bucket → `ingest` into D1
- `GET  /health`

Crons (`src/cron.ts`, selected by `MODE` env):

- `0 3 * * *`   daily metadata sync from PyPI RSS updates
- `0 4 * * 1`   weekly downloads sync (currently a placeholder in `syncDownloads`)

Search behavior (`src/search.ts`):

- FTS5 prefix match first; if <5 hits and query length ≥3, falls back to trigram
- Exact name match always promoted to position 0
- Results capped at 20, ordered by `downloads_4w DESC`

Data source for snapshots: `hugovk/top-pypi-packages` 30-day JSON, enriched via per-package `pypi.org/pypi/<name>/json`.

## Quirks

- `packages/web/dist` is the static assets dir, but `sst.config.ts` references it via an absolute path (`/root/pypipro/packages/web/dist`) — this is the Cloudflare build environment path, not local. Don't "fix" it to a relative path without testing `sst deploy`.
- Worker uses `compatibility date 2026-06-01` with `nodejs_compat` flag.
- `pypi.db` at repo root is gitignored local scratch (Miniflare/D1 local), not committed.
- Frontend is vanilla TS + Vite (no framework). Rebuild `packages/web` before deploying to pick up UI changes.