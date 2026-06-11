-- Private read-only share links. The race remains unlisted unless is_public is
-- true, but a matching share token in the request header grants read access.

ALTER TABLE races
    ADD COLUMN IF NOT EXISTS public_share_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS public_share_token text;

CREATE UNIQUE INDEX IF NOT EXISTS races_public_share_token_unique
    ON races(public_share_token)
    WHERE public_share_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_header(p_header text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_headers jsonb;
    v_lower text := lower(p_header);
BEGIN
    BEGIN
        v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
    EXCEPTION WHEN others THEN
        v_headers := '{}'::jsonb;
    END;

    RETURN NULLIF(COALESCE(v_headers ->> v_lower, v_headers ->> p_header), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_view_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid())
        OR EXISTS (
            SELECT 1
            FROM races
            WHERE id = rid
              AND (
                  is_public = true
                  OR (
                      public_share_enabled = true
                      AND public_share_token IS NOT NULL
                      AND public_share_token = public.request_header('x-dfiu-share-token')
                  )
              )
        );
$$;

REVOKE EXECUTE ON FUNCTION public.request_header(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_view_race(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_race(uuid) TO anon, authenticated;
