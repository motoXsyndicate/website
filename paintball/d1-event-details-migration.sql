ALTER TABLE pb_events ADD COLUMN team_size INTEGER NOT NULL DEFAULT 4 CHECK(team_size IN (3,4,5));
ALTER TABLE pb_events ADD COLUMN description TEXT;
ALTER TABLE pb_events ADD COLUMN match_format TEXT;
ALTER TABLE pb_events ADD COLUMN estimated_duration TEXT;

PRAGMA optimize;
