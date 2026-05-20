-- Official source events, multi-role memberships, runner GPS, and role-view helpers.

-- =========================================================================
-- 1. Official event metadata
-- =========================================================================
ALTER TABLE races
ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS official_at timestamptz,
ADD COLUMN IF NOT EXISTS race_director_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS official_source_race_id uuid REFERENCES races(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS races_is_official_idx ON races(is_official);
CREATE INDEX IF NOT EXISTS races_official_source_race_id_idx ON races(official_source_race_id);
CREATE INDEX IF NOT EXISTS races_race_director_user_id_idx ON races(race_director_user_id);

-- =========================================================================
-- 2. Multi-role membership flags. Keep the legacy role/permission columns for
--    compatibility with existing code and RLS, but make role views flag-based.
-- =========================================================================
ALTER TABLE race_memberships
ADD COLUMN IF NOT EXISTS is_runner boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_pacer boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_crew boolean NOT NULL DEFAULT false;

UPDATE race_memberships
SET
    is_crew = CASE WHEN role = 'crew' THEN true ELSE is_crew END,
    is_pacer = CASE WHEN role = 'pacer' THEN true ELSE is_pacer END,
    is_runner = CASE WHEN role = 'owner' THEN true ELSE is_runner END
WHERE role IN ('owner', 'crew', 'pacer');

-- =========================================================================
-- 3. Waypoint instruction fields for crew handoff and next-leg runner guidance.
-- =========================================================================
ALTER TABLE waypoints
ADD COLUMN IF NOT EXISTS crew_relay_notes text,
ADD COLUMN IF NOT EXISTS runner_next_leg_notes text;

-- =========================================================================
-- 4. Runner GPS location stream.
-- =========================================================================
CREATE TABLE IF NOT EXISTS runner_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    runner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    accuracy_m double precision,
    speed_mps double precision,
    heading_deg double precision,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_locations_race_recorded_idx
    ON runner_locations(race_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS runner_locations_runner_idx
    ON runner_locations(runner_user_id, recorded_at DESC);

ALTER TABLE runner_locations ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 5. Helper functions.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.user_is_site_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.user_is_race_director(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM races
        WHERE id = rid
          AND is_official = true
          AND race_director_user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.user_is_runner_for_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM race_memberships
        WHERE race_id = rid
          AND user_id = auth.uid()
          AND is_runner = true
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_team(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.user_is_site_admin()
        OR public.user_is_race_director(rid)
        OR public.user_is_runner_for_race(rid)
        OR EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid AND user_id = auth.uid() AND role = 'owner'
        );
$$;

CREATE OR REPLACE FUNCTION public.user_can_log_race_execution(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.user_can_manage_team(rid)
        OR EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid
              AND user_id = auth.uid()
              AND (is_crew = true OR is_pacer = true)
        );
$$;

-- Existing helper now distinguishes official source editing from clone/team
-- management. Site admin can still edit via RLS for emergency/admin work.
CREATE OR REPLACE FUNCTION public.user_can_edit_race(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.user_is_site_admin()
        OR public.user_is_race_director(rid)
        OR public.user_is_runner_for_race(rid)
        OR EXISTS (
            SELECT 1 FROM race_memberships
            WHERE race_id = rid
              AND user_id = auth.uid()
              AND permission = 'edit'
              AND role = 'owner'
        );
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_site_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_race_director(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_is_runner_for_race(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_manage_team(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_log_race_execution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_site_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_race_director(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_runner_for_race(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_team(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_log_race_execution(uuid) TO anon, authenticated;

-- =========================================================================
-- 6. RLS updates.
-- =========================================================================
DROP POLICY IF EXISTS "Owners can insert memberships" ON race_memberships;
DROP POLICY IF EXISTS "Owners can update memberships" ON race_memberships;
DROP POLICY IF EXISTS "Owners can delete memberships" ON race_memberships;

CREATE POLICY "Managers can insert memberships" ON race_memberships
    FOR INSERT WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "Managers can update memberships" ON race_memberships
    FOR UPDATE USING (user_can_manage_team(race_id)) WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "Managers can delete memberships" ON race_memberships
    FOR DELETE USING (user_can_manage_team(race_id));

DROP POLICY IF EXISTS "runner_checkins_insert" ON runner_checkins;
DROP POLICY IF EXISTS "runner_checkins_update" ON runner_checkins;
DROP POLICY IF EXISTS "runner_checkins_delete" ON runner_checkins;

CREATE POLICY "runner_checkins_insert" ON runner_checkins
    FOR INSERT WITH CHECK (user_can_log_race_execution(race_id));

CREATE POLICY "runner_checkins_update" ON runner_checkins
    FOR UPDATE USING (user_can_log_race_execution(race_id))
    WITH CHECK (user_can_log_race_execution(race_id));

CREATE POLICY "runner_checkins_delete" ON runner_checkins
    FOR DELETE USING (user_can_log_race_execution(race_id));

DROP POLICY IF EXISTS "runner_locations_select" ON runner_locations;
DROP POLICY IF EXISTS "runner_locations_insert" ON runner_locations;
DROP POLICY IF EXISTS "runner_locations_update" ON runner_locations;
DROP POLICY IF EXISTS "runner_locations_delete" ON runner_locations;

CREATE POLICY "runner_locations_select" ON runner_locations
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "runner_locations_insert" ON runner_locations
    FOR INSERT WITH CHECK (
        runner_user_id = auth.uid()
        AND user_is_runner_for_race(race_id)
    );

CREATE POLICY "runner_locations_update" ON runner_locations
    FOR UPDATE USING (
        runner_user_id = auth.uid()
        AND user_is_runner_for_race(race_id)
    ) WITH CHECK (
        runner_user_id = auth.uid()
        AND user_is_runner_for_race(race_id)
    );

CREATE POLICY "runner_locations_delete" ON runner_locations
    FOR DELETE USING (
        runner_user_id = auth.uid()
        OR user_can_manage_team(race_id)
    );

DROP FUNCTION IF EXISTS public.get_race_members(uuid);
CREATE FUNCTION public.get_race_members(p_race_id uuid)
RETURNS TABLE(
    user_id uuid,
    role text,
    permission text,
    is_runner boolean,
    is_pacer boolean,
    is_crew boolean,
    name text,
    avatar_url text,
    granted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
    SELECT
        rm.user_id,
        rm.role,
        rm.permission,
        rm.is_runner,
        rm.is_pacer,
        rm.is_crew,
        p.name,
        p.avatar_url,
        rm.granted_at
    FROM race_memberships rm
    LEFT JOIN profiles p ON p.id = rm.user_id
    WHERE rm.race_id = p_race_id
      AND user_can_view_race(p_race_id)
    ORDER BY
        CASE WHEN rm.is_runner THEN 0 WHEN rm.role = 'owner' THEN 1 WHEN rm.is_crew THEN 2 WHEN rm.is_pacer THEN 3 ELSE 4 END,
        rm.granted_at;
$func$;

REVOKE EXECUTE ON FUNCTION public.get_race_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_race_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    INSERT INTO public.profiles (id, name, avatar_url, email)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'avatar_url',
        new.email
    )
    ON CONFLICT (id) DO UPDATE
    SET
        name = COALESCE(EXCLUDED.name, profiles.name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
        email = COALESCE(EXCLUDED.email, profiles.email);

    IF new.email IS NOT NULL THEN
        INSERT INTO race_memberships (
            race_id, user_id, role, permission, granted_by, granted_at,
            is_runner, is_pacer, is_crew
        )
        SELECT
            race_id,
            new.id,
            role,
            'view',
            invited_by,
            now(),
            false,
            role = 'pacer',
            role = 'crew'
        FROM pending_race_memberships
        WHERE lower(email) = lower(new.email)
        ON CONFLICT DO NOTHING;

        DELETE FROM pending_race_memberships
        WHERE lower(email) = lower(new.email);
    END IF;

    RETURN new;
END;
$function$;

-- =========================================================================
-- 7. Clone function update: official source -> runner plan.
-- =========================================================================
CREATE OR REPLACE FUNCTION clone_race(p_race_id UUID)
RETURNS UUID AS $$
DECLARE
    v_new_race_id UUID;
    v_user_id UUID;
    v_old_course_id UUID;
    v_new_course_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO races (
        user_id, name, is_public, start_datetime,
        distance_miles, course_type, location,
        website_url, registration_url, overall_cutoff,
        avg_temp_high, avg_temp_low, weather_notes,
        timezone, terrain_type, weather_history,
        course_record_male, course_record_female, qualifies_for,
        racebook_url, racebook_last_updated, briefing_url, briefing_datetime,
        packet_pickup_url, packet_pickup_datetime, packet_pickup_info,
        past_results_url, media_url, entrants_url, tracking_url, lodging_info,
        sunrise_time, sunset_time, moon_phase, precip_chance,
        is_official, official_at, race_director_user_id, official_source_race_id,
        created_at, updated_at
    )
    SELECT
        v_user_id, name || ' (My Plan)', false, start_datetime,
        distance_miles, course_type, location,
        website_url, registration_url, overall_cutoff,
        avg_temp_high, avg_temp_low, weather_notes,
        timezone, terrain_type, weather_history,
        course_record_male, course_record_female, qualifies_for,
        racebook_url, racebook_last_updated, briefing_url, briefing_datetime,
        packet_pickup_url, packet_pickup_datetime, packet_pickup_info,
        past_results_url, media_url, entrants_url, tracking_url, lodging_info,
        sunrise_time, sunset_time, moon_phase, precip_chance,
        false, null, null, p_race_id,
        NOW(), NOW()
    FROM races
    WHERE id = p_race_id
    RETURNING id INTO v_new_race_id;

    SELECT id INTO v_old_course_id FROM courses WHERE race_id = p_race_id LIMIT 1;

    IF v_old_course_id IS NOT NULL THEN
        INSERT INTO courses (
            race_id, total_distance_miles,
            total_elevation_gain_ft, total_elevation_loss_ft,
            max_elevation_ft, min_elevation_ft,
            elevation_samples, geometry, raw_gpx, created_at
        )
        SELECT
            v_new_race_id, total_distance_miles,
            total_elevation_gain_ft, total_elevation_loss_ft,
            max_elevation_ft, min_elevation_ft,
            elevation_samples, geometry, raw_gpx, NOW()
        FROM courses
        WHERE id = v_old_course_id
        RETURNING id INTO v_new_course_id;

        INSERT INTO waypoints (
            course_id, lat, lon, name,
            elevation_ft, type,
            crew_allowed, pacer_allowed, has_drop_bag, cutoff_time, mile,
            drop_bag_items, drop_bag_name, drop_bag_notes,
            crew_relay_notes, runner_next_leg_notes,
            delay, order_index, created_at, updated_at
        )
        SELECT
            v_new_course_id, lat, lon, name,
            elevation_ft, type,
            crew_allowed, pacer_allowed, has_drop_bag, cutoff_time, mile,
            drop_bag_items, drop_bag_name, drop_bag_notes,
            crew_relay_notes, runner_next_leg_notes,
            delay, order_index, NOW(), NOW()
        FROM waypoints
        WHERE course_id = v_old_course_id;

        INSERT INTO terrain_nodes (
            course_id, lat, lon, mile, type, difficulty, created_at
        )
        SELECT
            v_new_course_id, lat, lon, mile, type, difficulty, NOW()
        FROM terrain_nodes
        WHERE course_id = v_old_course_id;
    END IF;

    UPDATE race_memberships
    SET role = 'owner',
        permission = 'edit',
        is_runner = true,
        is_crew = false,
        is_pacer = false
    WHERE race_id = v_new_race_id AND user_id = v_user_id;

    RETURN v_new_race_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
