PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pb_event_registrations (
  event_id TEXT NOT NULL REFERENCES pb_events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES pb_profiles(user_id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL,
  PRIMARY KEY(event_id,user_id)
);

INSERT OR IGNORE INTO pb_event_registrations(event_id,user_id,registered_at)
SELECT event_id,user_id,checked_in_at FROM pb_check_ins;

CREATE INDEX IF NOT EXISTS pb_event_registrations_user_idx
ON pb_event_registrations(user_id);

CREATE INDEX IF NOT EXISTS pb_event_registrations_event_idx
ON pb_event_registrations(event_id,registered_at);

PRAGMA optimize;
