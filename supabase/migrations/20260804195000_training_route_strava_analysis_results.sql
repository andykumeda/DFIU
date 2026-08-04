ALTER TABLE training_routes
    ADD COLUMN IF NOT EXISTS strava_activity_results jsonb NOT NULL DEFAULT '[]'::jsonb;
