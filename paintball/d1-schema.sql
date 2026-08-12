PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pb_users (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  discord_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pb_profiles (
  user_id TEXT PRIMARY KEY REFERENCES pb_users(id) ON DELETE CASCADE,
  in_game_name TEXT NOT NULL CHECK(length(in_game_name) BETWEEN 2 AND 40),
  rules_accepted_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pb_admins (
  user_id TEXT PRIMARY KEY REFERENCES pb_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pb_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES pb_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pb_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
  starts_at TEXT NOT NULL,
  check_in_opens_at TEXT NOT NULL,
  check_in_closes_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','check_in_open','check_in_closed','teams_generated','teams_published','completed','cancelled')),
  created_by TEXT NOT NULL REFERENCES pb_users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pb_check_ins (
  event_id TEXT NOT NULL REFERENCES pb_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES pb_profiles(user_id) ON DELETE CASCADE,
  checked_in_at TEXT NOT NULL,
  PRIMARY KEY(event_id,user_id)
);

CREATE TABLE IF NOT EXISTS pb_event_registrations (
  event_id TEXT NOT NULL REFERENCES pb_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES pb_profiles(user_id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL,
  PRIMARY KEY(event_id,user_id)
);

CREATE TABLE IF NOT EXISTS pb_assignments (
  event_id TEXT NOT NULL REFERENCES pb_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES pb_profiles(user_id) ON DELETE CASCADE,
  team_number INTEGER,
  is_reserve INTEGER NOT NULL DEFAULT 0 CHECK(is_reserve IN (0,1)),
  generation INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY(event_id,user_id),
  CHECK((is_reserve=1 AND team_number IS NULL) OR (is_reserve=0 AND team_number>0))
);

CREATE TABLE IF NOT EXISTS pb_bracket_matches (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES pb_events(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  team1_number INTEGER,
  team2_number INTEGER,
  score1 INTEGER,
  score2 INTEGER,
  winner_team_number INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','completed','bye')),
  next_match_id TEXT REFERENCES pb_bracket_matches(id) ON DELETE SET NULL,
  next_slot INTEGER CHECK(next_slot IN (1,2)),
  loser_next_match_id TEXT REFERENCES pb_bracket_matches(id) ON DELETE SET NULL,
  loser_next_slot INTEGER CHECK(loser_next_slot IN (1,2)),
  label TEXT NOT NULL DEFAULT 'Match',
  placement_winner INTEGER,
  placement_loser INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(event_id,round_number,match_number)
);

CREATE TABLE IF NOT EXISTS pb_placements (
  event_id TEXT NOT NULL REFERENCES pb_events(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  place INTEGER NOT NULL CHECK(place > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id,team_number),
  UNIQUE(event_id,place)
);

CREATE INDEX IF NOT EXISTS pb_sessions_user_idx ON pb_sessions(user_id);
CREATE INDEX IF NOT EXISTS pb_sessions_expires_idx ON pb_sessions(expires_at);
CREATE INDEX IF NOT EXISTS pb_events_status_start_idx ON pb_events(status,starts_at);
CREATE INDEX IF NOT EXISTS pb_check_ins_user_idx ON pb_check_ins(user_id);
CREATE INDEX IF NOT EXISTS pb_event_registrations_user_idx ON pb_event_registrations(user_id);
CREATE INDEX IF NOT EXISTS pb_event_registrations_event_idx ON pb_event_registrations(event_id,registered_at);
CREATE INDEX IF NOT EXISTS pb_assignments_user_idx ON pb_assignments(user_id);
CREATE INDEX IF NOT EXISTS pb_bracket_event_round_idx ON pb_bracket_matches(event_id,round_number,match_number);
CREATE INDEX IF NOT EXISTS pb_placements_event_idx ON pb_placements(event_id,place);

PRAGMA optimize;
