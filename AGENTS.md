# AGENTS.md

## SST Dev Requirements

For `bun run dev` (which runs `sst dev`) to work with the `pypi.pro` domain:

1. **Cloudflare Authentication**: Set `CLOUDFLARE_API_TOKEN` environment variable, or SST will prompt for interactive login on first run
2. **Domain in Cloudflare**: `pypi.pro` must be added to your Cloudflare account
3. **DNS Access**: You must have DNS control over `pypi.pro` to point it to Cloudflare
4. **SST State**: First run will create `.sst/` directory for state management

The dev server will attempt to provision the domain and create DNS records automatically.

## Commands

```bash
sst dev    # local Cloudflare simulation
sst deploy # deploy to Cloudflare
```

Uses Durable Objects, Workers, R2, Queues. Infrastructure defined in `sst.config.ts`.

```bash
bun test                          # run tests (query.ts unit tests)
bun run build                     # build frontend (packages/web)
bun scripts/build-snapshot.ts     # fetch top 15K PyPI packages → snapshot.ndjson
```

## Database Setup

Database is SQLite with FTS5. Schema auto-creates on first run. Tables: `packages`, `pkg_prefix` (FTS), `pkg_trigram` (FTS).

## Architecture

- **Search ranking**: Ordered by `downloads_4w DESC`
- **Exact matches**: Always promoted to position 0 regardless of score
- **Data source**: Top 15K packages by 30-day downloads from hugovk/top-pypi-packages
- **FTS sync**: Triggers keep FTS tables in sync with packages table (only on name/summary changes, not download updates)

## Project Structure

```
src/
  worker.ts         # Cloudflare Worker entry
  search-index.ts   # Durable Object class
  query.ts          # FTS term sanitizer + query builder
  types.ts          # PackageRecord interface
  consumer.ts       # Queue consumer
  cron.ts           # Scheduled jobs

packages/web/       # Vite frontend (vanilla TS)
scripts/            # Data ingestion scripts
```

## Key Quirks

- Frontend must be rebuilt after changes: `bun run build` in `packages/web/`
- No typecheck/lint commands configured; tests are the only verification
