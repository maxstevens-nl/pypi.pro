# AGENTS.md

## Commands

```bash
bun test                          # bun:test suites in src/*.test.ts (mocked DB, no Postgres needed)
bun run typecheck                 # two passes: tsconfig.json (infra/scripts) + tsconfig.app.json (src/test)
bun run lint                      # oxlint (config in .oxlintrc.json)
bun run dev                       # sst dev — provisions Neon, runs search worker + vite site (localhost:5173)
bun run dev:api                   # standalone `wrangler dev --local` on :8787 (offline path, needs DATABASE_URL in env)
bun run deploy                    # sst deploy --stage prod (auto-runs migrations on prod Neon — don't run casually)
(cd packages/web && bun run build)  # vite build → packages/web/dist; rebuild before deploy for UI changes

# Schema / migrations (drizzle)
bun run db:generate               # emit drizzle/XXXX_*.sql from src/schema.ts (commit SQL + meta snapshots)
bun run db:migrate                # apply drizzle/ migrations to linked DB (needs SST session env or DATABASE_URL)

# Data (all read Resource.NeonDatabase.connectionString → run inside an active SST session)
bun run db:seed:bigquery          # BigQuery seed; modes --dry-run | --test | --limit=N | --live (--force re-seeds)
bun scripts/backfill-downloads.ts # backfill downloads_4w from hugovk 30-day snapshot
bun scripts/reset-db.ts           # drop public schema + re-run migrations (also honors DATABASE_URL)

docker compose down -v            # only relevant if you use the optional local-Docker path (below)
```

Gotchas:

- `db:seed:local` and `db:seed:snapshot` in package.json are stale — those scripts were deleted (commit f812d33). Only `db:seed:bigquery` exists.
- `bun run db:seed:bigquery --live` scans ~137 GB in BigQuery (~$0.70) and refuses to re-seed once >500k rows unless `--force` is passed.
- `src/migrate.ts` and the seed/backfill scripts resolve the connection via `Resource.*` (injected through `SST_RESOURCES_JSON`), so standalone `bun` runs fail without an SST session; `reset-db`/`migrate` fall back to `DATABASE_URL`.
- There is no root `bun run build` — only the web package has a build script.

## Migrations

`infra/migrate.ts` is a `local.Command` that runs `bun ./src/migrate.ts` during `sst dev`/`sst deploy`, re-triggered whenever the hash of `drizzle/*.sql` changes. To change the schema: edit `src/schema.ts` → `bun run db:generate` → commit the new SQL → deploy (or migrate manually). Migrations only create/update schema; seed data separately.

## Infrastructure (infra/*.ts, composed in infra/app.ts)

- Postgres is **Neon**, provisioned through the `neon` provider in `sst.config.ts` (`infra/database.ts`): hardcoded project id, per-stage branch (non-prod) + role + database. Requires `NEON_API_KEY` in `.env` even for `sst dev` — real Neon is used locally; Docker is optional, not required.
- `sst.cloudflare.Hyperdrive` caches the Neon connection; Search Worker and Cron link to it.
- Search Worker `Search` (`src/worker.ts`): `/api/search?q=` → JSON; `/search` → 301 to `/?q=...`; other paths → `env.ASSETS`.
- StaticSiteV2 `Web` (`packages/web`, vanilla TS + Vite) serves the frontend. `infra/routes.ts` routes `/api/*` and `/search(/…)` to the Search worker, everything else to Web.
- Cron `DailyRefresh` (`src/cron.ts`, daily 07:00 UTC): queries `bigquery-public-data.pypi.distribution_metadata` for releases in the last 24h and upserts via a `pg` Client over Hyperdrive. Credentials: SST Secret `GcpServiceAccountKey` (`sst secret set GcpServiceAccountKey '<json>'`) + `GcpConfig` (reads `GOOGLE_PROJECT` at config time).
- Domains per stage (`infra/stage.ts`): prod → `pypi.pro`, dev → `dev.pypi.pro`, else `<stage>.dev.pypi.pro`. Prod `removal: retain`.

## Search (`src/search.ts` + `src/query.ts`)

One SQL statement with CTEs, tiered:

1. Prefix `LIKE lower(name)%` — exact name match ranked first within the tier
2. Trigram similarity (`lower(name) % q`, k-NN `<->`) — only when `len(q) >= 3`
3. Full-text over `search_tsv` (name+summary+keywords, simple+english) — only when `len(q) >= 3`

Dedup by name (lowest tier wins), then sort tier → similarity → `ln(downloads_4w+1)` → name, cap 20. Supporting indexes are declared in `src/schema.ts` (btree `text_pattern_ops`, GIN `gin_trgm_ops`, GIN `search_tsv`).

## Local dev / environment

- `.env` (copy `.env.example`): `CLOUDFLARE_API_TOKEN`, `NEON_API_KEY`, `GOOGLE_PROJECT`. No `DATABASE_URL` — the worker gets the live Neon connection string injected via `infra/api.ts`.
- Optional fully-offline path: `docker compose up` (postgres:18 on host `:5435` + `local-neon-http-proxy` on `:4444`), set `DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5435/main`, then `bun run dev:api`. `src/db.ts` rewrites the neon-http fetch endpoint to the local proxy when the host is `db.localtest.me` (`*.localtest.me` resolves to `127.0.0.1`).
- Frontend: no framework; `VITE_API_URL` is baked in at build time (`infra/site.ts` env + `vite.config.ts`).

## Quirks

- `sst-env.d.ts` (root and `packages/web/`) is auto-generated by `sst dev`/`sst deploy`. `Resource.*` types only resolve once it exists — after changing resource/link names, re-run `sst dev` before `bun run typecheck`.
- typecheck is two passes: `tsconfig.json` covers infra/scripts (bun-types); `tsconfig.app.json` covers src/test (`@cloudflare/workers-types`). Both include `sst-env.d.ts`.
- Worker compat: `2026-06-01` + `nodejs_compat` (`wrangler.dev.toml`, `infra/api.ts`).
- `.data/` is gitignored local scratch (`pypi.db`, `snapshot.ndjson`, `seed-data.bak`), not committed.
- No CI in-repo; run `bun run lint` and `bun run typecheck` before committing.
