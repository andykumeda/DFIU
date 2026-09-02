-- A direct INSERT ... RETURNING on races is also checked by races_select.
-- The owner membership is created by an AFTER INSERT trigger, so an ordinary
-- creator can reach the select check before membership-based visibility is
-- available. Recognize the canonical races.user_id owner at this boundary,
-- matching the existing user_owns_race fallback.
CREATE OR REPLACE FUNCTION public.user_can_view_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1
            FROM races
            WHERE id = rid AND user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM site_admins
            WHERE user_id = auth.uid()
        )
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

REVOKE EXECUTE ON FUNCTION public.user_can_view_race(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_race(uuid) TO anon, authenticated;

-- Evaluate creator ownership directly against the candidate row. During an
-- INSERT ... RETURNING, the row is not yet visible to the helper's subquery,
-- so the policy itself must carry this check.
DROP POLICY IF EXISTS "races_select" ON public.races;
CREATE POLICY "races_select" ON public.races
    FOR SELECT
    USING (
        user_id = auth.uid()
        OR public.user_can_view_race(id)
    );
