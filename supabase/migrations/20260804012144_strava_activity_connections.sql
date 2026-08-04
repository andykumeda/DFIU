-- Server-only Strava OAuth credentials for activity comparison.
-- The browser never receives these values: RLS is enabled with no client
-- policies and authenticated/anonymous roles have no table privileges.
CREATE TABLE IF NOT EXISTS public.strava_connections (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    athlete_id bigint NOT NULL UNIQUE,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    scope text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.strava_connections FROM anon, authenticated;
