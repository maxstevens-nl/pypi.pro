-- Neon Postgres schema for PyPI search
-- Run against the Neon database referenced by DATABASE_URL in .env, e.g.:
--   psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS packages (
  name           TEXT PRIMARY KEY,
  display_name   TEXT,
  summary        TEXT,
  version        TEXT,
  home_page      TEXT,
  updated_at     BIGINT,
  downloads_1w   BIGINT DEFAULT 0,
  downloads_4w   BIGINT DEFAULT 0,
  trend          REAL   DEFAULT 0,
  downloads_52w  INTEGER[]
);

-- Trigram index powers both prefix LIKE 'q%' and fuzzy % similarity searches.
CREATE INDEX IF NOT EXISTS idx_packages_name_trgm ON packages USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_packages_downloads ON packages(downloads_4w DESC);