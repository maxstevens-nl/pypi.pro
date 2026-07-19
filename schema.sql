-- D1 schema for PyPI search

CREATE TABLE IF NOT EXISTS packages (
  name           TEXT PRIMARY KEY,
  display_name   TEXT,
  summary        TEXT,
  version        TEXT,
  home_page      TEXT,
  updated_at     INTEGER,
  downloads_1w   INTEGER DEFAULT 0,
  downloads_4w   INTEGER DEFAULT 0,
  trend          REAL   DEFAULT 0,
  downloads_52w  BLOB
);

CREATE VIRTUAL TABLE IF NOT EXISTS pkg_prefix USING fts5(
  name, summary,
  content='packages', content_rowid='rowid',
  prefix='2 3 4'
);

CREATE VIRTUAL TABLE IF NOT EXISTS pkg_trigram USING fts5(
  name, summary,
  content='packages', content_rowid='rowid',
  tokenize='trigram'
);

-- Index for exact match lookups
CREATE INDEX IF NOT EXISTS idx_packages_name ON packages(name);
CREATE INDEX IF NOT EXISTS idx_packages_downloads ON packages(downloads_4w DESC);
