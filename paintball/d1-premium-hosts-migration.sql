PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pb_host_branding (
  user_id TEXT PRIMARY KEY REFERENCES pb_users(id) ON DELETE CASCADE,
  is_premium INTEGER NOT NULL DEFAULT 0 CHECK(is_premium IN (0,1)),
  organization_name TEXT,
  logo_url TEXT,
  banner_url TEXT,
  accent_color TEXT,
  sponsor_text TEXT,
  updated_at TEXT NOT NULL
);

PRAGMA optimize;
