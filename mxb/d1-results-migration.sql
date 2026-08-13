PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mxb_hosts (
  user_id TEXT PRIMARY KEY REFERENCES pb_users(id) ON DELETE CASCADE,
  approved_by TEXT NOT NULL REFERENCES pb_users(id),
  approved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mxb_rounds (
  id TEXT PRIMARY KEY,
  round_name TEXT NOT NULL,
  event_info TEXT,
  class_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
  created_by TEXT NOT NULL REFERENCES pb_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mxb_series (
  id TEXT PRIMARY KEY,
  series_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
  created_by TEXT NOT NULL REFERENCES pb_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mxb_rounds_owner_updated ON mxb_rounds(created_by,updated_at);
CREATE INDEX IF NOT EXISTS idx_mxb_rounds_public_updated ON mxb_rounds(published,updated_at);
CREATE INDEX IF NOT EXISTS idx_mxb_series_owner_updated ON mxb_series(created_by,updated_at);
CREATE INDEX IF NOT EXISTS idx_mxb_series_public_updated ON mxb_series(published,updated_at);

PRAGMA optimize;
