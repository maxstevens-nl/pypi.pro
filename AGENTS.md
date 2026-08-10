# AGENTS.md

## Commands

```bash
bun test                          # bun:test suites in src/*.test.ts (mocked DB, no Postgres needed)
bun run typecheck                 # two passes: tsconfig.json (infra/scripts) + tsconfig.app.json (src/test)
bun run lint                      # oxlint (config in .oxlintrc.json)
bun run dev                       # sst dev — provisions Neon, runs search worker + vite site (localhost:5173)
bun run deploy                    # sst deploy --stage prod (auto-runs migrations on prod Neon — don't run casually)
(cd packages/web && bun run build)  # vite build → packages/web/dist; rebuild before deploy for UI changes

# Schema / migrations (drizzle)
bun run db:generate               # emit drizzle/XXXX_*.sql from src/schema.ts (commit SQL + meta snapshots)
bun run db:migrate                # apply drizzle/ migrations to linked DB (needs SST session env or DATABASE_URL)

# Lakebase Search (one-time per Neon project)
NEON_API_KEY=napi_... bun run db:enable-lakebase  # add lakebase_vector/lakebase_text to shared_preload_libraries + restart computes

# Data (all read Resource.NeonDatabase.connectionString → run inside an active SST session)
bun run db:seed:bigquery          # BigQuery seed; modes --dry-run | --test | --limit=N | --live (--force re-seeds)
bun scripts/backfill-downloads.ts # backfill downloads_4w from hugovk 30-day snapshot
bun scripts/reset-db.ts           # drop public schema + re-run migrations (also honors DATABASE_URL)
bun scripts/detect-import-name.ts # resolve a package's import name(s); see scripts/import-name.ts for the algorithm
bun scripts/detect-import-name-snapshot.ts  # bulk-detect import names from .data/snapshot.ndjson → .data/import-names.csv
bun scripts/import-import-names.ts # import .data/import-names.csv into packages.import_names (updates ONLY that column; honors DATABASE_URL)

# Benchmarks (local only, no SST session needed)
bun scripts/bench-parse-keywords.ts [rounds]  # parseKeywords vs naive regex baseline over .data/output.sqlite keywords (~358k rows)
```

Gotchas:

- `db:seed:local` and `db:seed:snapshot` in package.json are stale — those scripts were deleted (commit f812d33). Only `db:seed:bigquery` exists.
- `bun run db:seed:bigquery --live` scans ~137 GB in BigQuery (~$0.70) and refuses to re-seed once >500k rows unless `--force` is passed.
- `src/migrate.ts` and the seed/backfill scripts resolve the connection via `Resource.*` (injected through `SST_RESOURCES_JSON`), so standalone `bun` runs fail without an SST session; `reset-db`/`migrate`/`import-import-names` fall back to `DATABASE_URL`.
- There is no root `bun run build` — only the web package has a build script.

## Lakebase Search (BM25)

Search uses Neon's `lakebase_text` extension (`lakebase_bm25` index) instead of a GIN `tsvector` index. One-time setup per Neon project:

1. `NEON_API_KEY=napi_... bun run db:enable-lakebase` — adds `lakebase_vector`/`lakebase_text` to the project's `shared_preload_libraries` (idempotent; replaces the list, keeping existing entries) and restarts active computes. Requires Neon to have granted your account Lakebase Search access — the script fails if the libraries aren't in `available_preload_libraries`.
2. Deploy (`bun run deploy` or `sst dev`) — migration `drizzle/0006_*.sql` runs `CREATE EXTENSION IF NOT EXISTS lakebase_text` and builds `idx_packages_search_bm25` (`USING lakebase_bm25 (search_tsv) WITH (default_limit=20)`). The migration is written idempotently (`IF NOT EXISTS`/`IF EXISTS`) and also restores `search_tsv` + the name indexes, so it applies cleanly whether or not a database already ran the earlier WIP migration that dropped them.

Notes:

- `lakebase_bm25` computes corpus-wide BM25 statistics at index build time and refreshes them on VACUUM. After `db:seed:bigquery --live` (or any large bulk load), run `VACUUM packages` so scores stay accurate.
- The extension is Neon/Databricks-only — there is no Docker image, and the old offline Docker dev path was removed (commit in this change).
- `default_limit=100` sizes the BM25 candidate pool for re-ranking (search caps at 20), so top-K pushdown returns only what the re-rank needs.

## Migrations

`infra/migrate.ts` is a `local.Command` that runs `bun ./src/migrate.ts` during `sst dev`/`sst deploy`, re-triggered whenever the hash of `drizzle/*.sql` changes. To change the schema: edit `src/schema.ts` → `bun run db:generate` → commit the new SQL → deploy (or migrate manually). Migrations only create/update schema; seed data separately.

## Infrastructure (infra/*.ts, composed in infra/app.ts)

- Postgres is **Neon**, provisioned through the `neon` provider in `sst.config.ts` (`infra/database.ts`): hardcoded project id, per-stage branch (non-prod) + role + database. Requires `NEON_API_KEY` in `.env` even for `sst dev` — real Neon is used locally.
- Workers connect to Neon directly via a `DATABASE_URL` env var (`infra/api.ts`), not Hyperdrive. `sst.cloudflare.Hyperdrive` (`infra/database.ts`) is kept around but not linked to any worker.
- Search Worker `Search` (`src/worker.ts`): `/api/search?q=` → JSON; `/search` → 301 to `/?q=...`; other paths → `env.ASSETS`.
- StaticSiteV2 `Web` (`packages/web`, vanilla TS + Vite) serves the frontend. `infra/routes.ts` routes `/api/*` and `/search(/…)` to the Search worker, everything else to Web.
- Cron `DailyRefresh` (`src/cron.ts`, daily 07:00 UTC): queries `bigquery-public-data.pypi.distribution_metadata` for releases in the last 24h and upserts via a `pg` Client over `DATABASE_URL` (direct to Neon). Credentials: SST Secret `GcpServiceAccountKey` (`sst secret set GcpServiceAccountKey '<json>'`) + `GcpConfig` (reads `GOOGLE_PROJECT` at config time).
- Domains per stage (`infra/stage.ts`): prod → `pypi.pro`, dev → `dev.pypi.pro`, else `<stage>.dev.pypi.pro`. Prod `removal: retain`.

## Search (`src/search.ts`)

A single BM25 query over `search_tsv` via `<@>`/`to_bm25query` against `idx_packages_search_bm25`. `search_tsv` is a generated `tsvector` over the normalized name plus the package's `import_names`. The expression is `to_tsvector('simple', lower(regexp_replace(coalesce(name,''), '[-_.]+', '-', 'g'))) || to_tsvector('simple', import_names_to_text(import_names))` — the name part is inlined (not `normalized_name`) because Postgres won't let a generated column reference another generated column; the import-name part goes through the `import_names_to_text(text[])` helper created in migration `0010` (`replace(coalesce(array_to_string(names,' '),''), '.', ' ')`). The helper exists because `array_to_string`/array output casts are STABLE, which Postgres rejects in a generated column; the wrapper is declared `IMMUTABLE` (safe: `text[]` output is deterministic) so dotted names like `opentelemetry.instrumentation.mistralai` tokenize into `opentelemetry`, `instrumentation`, `mistralai` and are searchable. The query is normalized the same way — lowercased with runs of `-`/`_`/`.` folded to `-` — before being fed to `to_bm25query`. The `<@>` operator returns the negative BM25 score, so `ORDER BY score` ascending returns most-relevant-first; matches are docs with `score < 0`. The `lakebase_bm25` index is created with `default_limit = 100`, so Block-Max WAND top-K pushdown scans at most the top 100 candidates. Because BM25 length-normalization can push the exact-name package outside that top 100, an `exact` CTE branch injects the row where `normalized_name = <normalized query>` as a guaranteed candidate; candidates are de-duplicated by name and capped at 20. Re-rank order: exact normalized-name match first, then `downloads_4w` descending, then BM25 score. Results include `downloads_4w` and `import_names` (the frontend renders import names as code chips next to each package name). Supporting indexes are declared in `src/schema.ts`: btree `text_pattern_ops` + GIN `gin_trgm_ops` on `lower(name)`, btree on the generated `normalized_name` column (`lower(regexp_replace(coalesce(name,''), '[-_.]+', '-', 'g'))`), and `lakebase_bm25` on the generated `search_tsv` column.

## Local dev / environment

- `.env` (copy `.env.example`): `CLOUDFLARE_API_TOKEN`, `NEON_API_KEY`, `GOOGLE_PROJECT`. No `DATABASE_URL` — the worker gets the live Neon connection string injected via `infra/api.ts`.
- Search runs against real Neon in `sst dev`; there is no offline Docker path (`lakebase_text` only exists on Neon/Databricks).
- Frontend: no framework; `VITE_API_URL` is baked in at build time (`infra/site.ts` env + `vite.config.ts`).

## Quirks

- `sst-env.d.ts` (root and `packages/web/`) is auto-generated by `sst dev`/`sst deploy`. `Resource.*` types only resolve once it exists — after changing resource/link names, re-run `sst dev` before `bun run typecheck`.
- typecheck is two passes: `tsconfig.json` covers infra/scripts (bun-types); `tsconfig.app.json` covers src/test (`@cloudflare/workers-types`). Both include `sst-env.d.ts`.
- Worker compat: `2026-06-01` + `nodejs_compat` (`infra/api.ts`).
- `.data/` is gitignored local scratch (`pypi.db`, `snapshot.ndjson`, `seed-data.bak`), not committed.
- No CI in-repo; run `bun run lint` and `bun run typecheck` before committing.
