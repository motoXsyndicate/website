PRAGMA foreign_keys = ON;

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

CREATE INDEX IF NOT EXISTS pb_bracket_event_round_idx
ON pb_bracket_matches(event_id,round_number,match_number);

CREATE INDEX IF NOT EXISTS pb_placements_event_idx
ON pb_placements(event_id,place);

PRAGMA optimize;
