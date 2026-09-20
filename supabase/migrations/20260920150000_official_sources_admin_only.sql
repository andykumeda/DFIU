-- Global official event sources are shared records. Only a site admin may
-- mutate them. Personal clones retain the existing owner/editor behavior.

CREATE OR REPLACE FUNCTION public.user_can_edit_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM races WHERE id = rid AND is_official = true)
            THEN public.user_is_site_admin()
        ELSE public.user_is_site_admin()
            OR public.user_is_race_director(rid)
            OR EXISTS (
                SELECT 1 FROM race_memberships
                WHERE race_id = rid
                  AND user_id = auth.uid()
                  AND permission = 'edit'
                  AND (role = 'owner' OR is_runner = true)
            )
    END;
$$;

CREATE OR REPLACE FUNCTION public.user_owns_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM races WHERE id = rid AND is_official = true)
            THEN public.user_is_site_admin()
        ELSE public.user_is_site_admin()
            OR EXISTS (SELECT 1 FROM races WHERE id = rid AND user_id = auth.uid())
            OR EXISTS (
                SELECT 1 FROM race_memberships
                WHERE race_id = rid AND user_id = auth.uid() AND role = 'owner'
            )
    END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_team(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM races WHERE id = rid AND is_official = true)
            THEN public.user_is_site_admin()
        ELSE public.user_is_site_admin()
            OR public.user_is_race_director(rid)
            OR public.user_is_runner_for_race(rid)
            OR EXISTS (
                SELECT 1 FROM race_memberships
                WHERE race_id = rid AND user_id = auth.uid() AND role = 'owner'
            )
    END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_log_race_execution(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM races WHERE id = rid AND is_official = true)
            THEN public.user_is_site_admin()
        ELSE public.user_can_manage_team(rid)
            OR EXISTS (
                SELECT 1 FROM race_memberships
                WHERE race_id = rid
                  AND user_id = auth.uid()
                  AND (is_crew = true OR is_pacer = true)
            )
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.user_can_edit_race(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_owns_race(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_manage_team(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_log_race_execution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_edit_race(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_race(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_team(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_log_race_execution(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS races_insert ON public.races;
CREATE POLICY races_insert ON public.races
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND (is_official = false OR public.user_is_site_admin())
    );

DROP POLICY IF EXISTS "Managers or inviter can delete pending" ON public.pending_race_memberships;
CREATE POLICY "Managers or inviter can delete pending" ON public.pending_race_memberships
    FOR DELETE USING (
        public.user_can_manage_team(race_id)
        OR (
            invited_by = auth.uid()
            AND NOT EXISTS (SELECT 1 FROM races WHERE id = race_id AND is_official = true)
        )
    );

DROP POLICY IF EXISTS runner_locations_insert ON public.runner_locations;
DROP POLICY IF EXISTS runner_locations_update ON public.runner_locations;
DROP POLICY IF EXISTS runner_locations_delete ON public.runner_locations;

CREATE POLICY runner_locations_insert ON public.runner_locations
    FOR INSERT WITH CHECK (
        (runner_user_id = auth.uid() AND public.user_is_runner_for_race(race_id))
        AND (
            NOT EXISTS (SELECT 1 FROM races WHERE id = race_id AND is_official = true)
            OR public.user_is_site_admin()
        )
    );

CREATE POLICY runner_locations_update ON public.runner_locations
    FOR UPDATE USING (
        public.user_is_site_admin()
        OR (
            runner_user_id = auth.uid()
            AND public.user_is_runner_for_race(race_id)
            AND NOT EXISTS (SELECT 1 FROM races WHERE id = race_id AND is_official = true)
        )
    )
    WITH CHECK (
        public.user_is_site_admin()
        OR (
            runner_user_id = auth.uid()
            AND public.user_is_runner_for_race(race_id)
            AND NOT EXISTS (SELECT 1 FROM races WHERE id = race_id AND is_official = true)
        )
    );

CREATE POLICY runner_locations_delete ON public.runner_locations
    FOR DELETE USING (
        public.user_can_manage_team(race_id)
        OR (
            runner_user_id = auth.uid()
            AND NOT EXISTS (SELECT 1 FROM races WHERE id = race_id AND is_official = true)
        )
    );

CREATE OR REPLACE FUNCTION public.sync_official_race_to_clones(p_source_race_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clone_race_id uuid;
  v_synced_count integer := 0;
BEGIN
  IF NOT public.user_is_site_admin() THEN
    RAISE EXCEPTION 'Only a site admin can update every plan from an official source';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM races
    WHERE id = p_source_race_id AND is_official = true
  ) THEN
    RETURN 0;
  END IF;

  FOR v_clone_race_id IN
    SELECT id FROM races WHERE official_source_race_id = p_source_race_id
  LOOP
    PERFORM public._sync_official_race_to_clone_internal(v_clone_race_id);
    v_synced_count := v_synced_count + 1;
  END LOOP;

  RETURN v_synced_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_official_race_to_clones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_official_race_to_clones(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._sync_official_race_to_clone_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_official_revision(uuid) FROM PUBLIC, anon, authenticated;
