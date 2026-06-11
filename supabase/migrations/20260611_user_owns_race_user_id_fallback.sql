-- Treat the creator stored on races.user_id as an owner in addition to the
-- RBAC owner membership row. This keeps cloned and legacy private events
-- deletable even if membership state is stale or incomplete.
CREATE OR REPLACE FUNCTION public.user_owns_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        EXISTS (
            SELECT 1 FROM races
            WHERE id = rid AND user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid() AND role = 'owner'
        )
        OR EXISTS (
            SELECT 1 FROM site_admins
            WHERE user_id = auth.uid()
        );
$$;

REVOKE EXECUTE ON FUNCTION public.user_owns_race(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_owns_race(uuid) TO anon, authenticated;
