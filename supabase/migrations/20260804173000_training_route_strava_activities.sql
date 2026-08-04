ALTER TABLE training_routes
    ADD COLUMN IF NOT EXISTS strava_activity_inputs jsonb NOT NULL DEFAULT '[]'::jsonb;
