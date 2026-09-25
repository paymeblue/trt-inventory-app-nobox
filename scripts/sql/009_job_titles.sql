-- What someone is called in the business (CEO, COO, Head of Design…). The role
-- still decides what they may do in the app.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;
