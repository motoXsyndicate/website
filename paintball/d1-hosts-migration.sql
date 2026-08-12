PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pb_hosts (
  user_id TEXT PRIMARY KEY REFERENCES pb_users(id) ON DELETE CASCADE,
  approved_by TEXT NOT NULL REFERENCES pb_users(id),
  approved_at TEXT NOT NULL
);

PRAGMA optimize;
