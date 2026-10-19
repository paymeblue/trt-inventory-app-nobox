-- When each reservation event was emailed to the people it concerns. Events
-- from before email existed count as sent, so nobody gets the history.
ALTER TABLE reservation_events ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
UPDATE reservation_events SET emailed_at = created_at WHERE emailed_at IS NULL;
CREATE INDEX IF NOT EXISTS reservation_events_unemailed_idx ON reservation_events (created_at) WHERE emailed_at IS NULL;
