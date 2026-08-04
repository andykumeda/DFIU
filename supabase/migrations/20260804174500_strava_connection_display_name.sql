ALTER TABLE public.strava_connections
    ADD COLUMN IF NOT EXISTS athlete_name text;
