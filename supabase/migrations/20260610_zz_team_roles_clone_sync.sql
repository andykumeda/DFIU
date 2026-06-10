-- Team role flags for pending invites plus official-source clone syncing.

-- Pending invites previously stored a single legacy role. Keep that column for
-- compatibility, but add the same multi-role flags used by race_memberships.
ALTER TABLE pending_race_memberships
    ADD COLUMN IF NOT EXISTS is_crew boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_pacer boolean NOT NULL DEFAULT false;

UPDATE pending_race_memberships
SET
    is_crew = CASE WHEN role = 'crew' THEN true ELSE is_crew END,
    is_pacer = CASE WHEN role = 'pacer' THEN true ELSE is_pacer END;

ALTER TABLE pending_race_memberships
    DROP CONSTRAINT IF EXISTS pending_race_memberships_has_role;

ALTER TABLE pending_race_memberships
    ADD CONSTRAINT pending_race_memberships_has_role
    CHECK (is_crew OR is_pacer) NOT VALID;

ALTER TABLE pending_race_memberships
    VALIDATE CONSTRAINT pending_race_memberships_has_role;

DROP FUNCTION IF EXISTS public.get_pending_race_invites(uuid);
CREATE FUNCTION public.get_pending_race_invites(p_race_id uuid)
RETURNS TABLE(
    id uuid,
    email text,
    role text,
    permission text,
    is_crew boolean,
    is_pacer boolean,
    invited_by uuid,
    invited_by_name text,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
    SELECT
        p.id,
        p.email,
        p.role,
        p.permission,
        p.is_crew,
        p.is_pacer,
        p.invited_by,
        prof.name AS invited_by_name,
        p.created_at
    FROM pending_race_memberships p
    LEFT JOIN profiles prof ON prof.id = p.invited_by
    WHERE p.race_id = p_race_id
      AND user_is_race_member(p_race_id)
    ORDER BY p.created_at DESC;
$func$;

REVOKE EXECUTE ON FUNCTION public.get_pending_race_invites(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_race_invites(uuid) TO authenticated;

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
            CASE WHEN is_crew THEN 'crew' ELSE 'pacer' END,
            permission,
            invited_by,
            now(),
            false,
            is_pacer,
            is_crew
        FROM pending_race_memberships
        WHERE lower(email) = lower(new.email)
        ON CONFLICT (race_id, user_id) DO UPDATE
        SET
            role = CASE WHEN EXCLUDED.is_crew THEN 'crew' ELSE 'pacer' END,
            permission = CASE
                WHEN race_memberships.permission = 'edit' OR EXCLUDED.permission = 'edit' THEN 'edit'
                ELSE 'view'
            END,
            is_crew = race_memberships.is_crew OR EXCLUDED.is_crew,
            is_pacer = race_memberships.is_pacer OR EXCLUDED.is_pacer,
            granted_by = COALESCE(race_memberships.granted_by, EXCLUDED.granted_by)
        WHERE race_memberships.role <> 'owner';

        DELETE FROM pending_race_memberships
        WHERE lower(email) = lower(new.email);
    END IF;

    RETURN new;
END;
$function$;

-- Source-row mapping lets official event updates touch the matching clone rows
-- without replacing user-specific race data such as memberships, pace plans,
-- check-ins, and packed drop-bag contents.
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS official_source_course_id uuid REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE waypoints
    ADD COLUMN IF NOT EXISTS official_source_waypoint_id uuid REFERENCES waypoints(id) ON DELETE SET NULL;

ALTER TABLE terrain_nodes
    ADD COLUMN IF NOT EXISTS official_source_terrain_node_id uuid REFERENCES terrain_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS courses_official_source_course_id_idx
    ON courses(official_source_course_id);

CREATE UNIQUE INDEX IF NOT EXISTS waypoints_official_source_waypoint_unique
    ON waypoints(course_id, official_source_waypoint_id)
    WHERE official_source_waypoint_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS terrain_nodes_official_source_terrain_node_unique
    ON terrain_nodes(course_id, official_source_terrain_node_id)
    WHERE official_source_terrain_node_id IS NOT NULL;

-- Backfill source mappings for existing clones using deterministic course order.
UPDATE courses clone_course
SET official_source_course_id = source_course.id
FROM races clone_race
JOIN courses source_course ON source_course.race_id = clone_race.official_source_race_id
WHERE clone_course.race_id = clone_race.id
  AND clone_race.official_source_race_id IS NOT NULL
  AND clone_course.official_source_course_id IS NULL;

WITH source_ranked AS (
    SELECT
        source_race.id AS source_race_id,
        source_waypoint.id AS source_waypoint_id,
        row_number() OVER (
            PARTITION BY source_race.id
            ORDER BY source_waypoint.mile, source_waypoint.order_index, source_waypoint.name, source_waypoint.id
        ) AS rn
    FROM races source_race
    JOIN courses source_course ON source_course.race_id = source_race.id
    JOIN waypoints source_waypoint ON source_waypoint.course_id = source_course.id
),
clone_ranked AS (
    SELECT
        clone_race.official_source_race_id AS source_race_id,
        clone_waypoint.id AS clone_waypoint_id,
        clone_course.id AS clone_course_id,
        row_number() OVER (
            PARTITION BY clone_course.id
            ORDER BY clone_waypoint.mile, clone_waypoint.order_index, clone_waypoint.name, clone_waypoint.id
        ) AS rn
    FROM races clone_race
    JOIN courses clone_course ON clone_course.race_id = clone_race.id
    JOIN waypoints clone_waypoint ON clone_waypoint.course_id = clone_course.id
    WHERE clone_race.official_source_race_id IS NOT NULL
      AND clone_waypoint.official_source_waypoint_id IS NULL
)
UPDATE waypoints clone_waypoint
SET official_source_waypoint_id = source_ranked.source_waypoint_id
FROM clone_ranked
JOIN source_ranked
  ON source_ranked.source_race_id = clone_ranked.source_race_id
 AND source_ranked.rn = clone_ranked.rn
WHERE clone_waypoint.id = clone_ranked.clone_waypoint_id
  AND NOT EXISTS (
      SELECT 1
      FROM waypoints existing
      WHERE existing.course_id = clone_ranked.clone_course_id
        AND existing.official_source_waypoint_id = source_ranked.source_waypoint_id
  );

WITH source_ranked AS (
    SELECT
        source_race.id AS source_race_id,
        source_node.id AS source_node_id,
        row_number() OVER (
            PARTITION BY source_race.id
            ORDER BY source_node.mile, source_node.lat, source_node.lon, source_node.id
        ) AS rn
    FROM races source_race
    JOIN courses source_course ON source_course.race_id = source_race.id
    JOIN terrain_nodes source_node ON source_node.course_id = source_course.id
),
clone_ranked AS (
    SELECT
        clone_race.official_source_race_id AS source_race_id,
        clone_node.id AS clone_node_id,
        clone_course.id AS clone_course_id,
        row_number() OVER (
            PARTITION BY clone_course.id
            ORDER BY clone_node.mile, clone_node.lat, clone_node.lon, clone_node.id
        ) AS rn
    FROM races clone_race
    JOIN courses clone_course ON clone_course.race_id = clone_race.id
    JOIN terrain_nodes clone_node ON clone_node.course_id = clone_course.id
    WHERE clone_race.official_source_race_id IS NOT NULL
      AND clone_node.official_source_terrain_node_id IS NULL
)
UPDATE terrain_nodes clone_node
SET official_source_terrain_node_id = source_ranked.source_node_id
FROM clone_ranked
JOIN source_ranked
  ON source_ranked.source_race_id = clone_ranked.source_race_id
 AND source_ranked.rn = clone_ranked.rn
WHERE clone_node.id = clone_ranked.clone_node_id
  AND NOT EXISTS (
      SELECT 1
      FROM terrain_nodes existing
      WHERE existing.course_id = clone_ranked.clone_course_id
        AND existing.official_source_terrain_node_id = source_ranked.source_node_id
  );

CREATE OR REPLACE FUNCTION public.sync_official_race_to_clones(p_source_race_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clone_race_id uuid;
    v_source_course_id uuid;
    v_clone_course_id uuid;
    v_synced_count integer := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM races
        WHERE id = p_source_race_id
          AND is_official = true
    ) THEN
        RETURN 0;
    END IF;

    SELECT id INTO v_source_course_id
    FROM courses
    WHERE race_id = p_source_race_id
    LIMIT 1;

    FOR v_clone_race_id IN
        SELECT id
        FROM races
        WHERE official_source_race_id = p_source_race_id
    LOOP
        v_synced_count := v_synced_count + 1;

        UPDATE races clone
        SET
            name = source.name || ' (My Plan)',
            start_datetime = source.start_datetime,
            distance_miles = source.distance_miles,
            course_type = source.course_type,
            location = source.location,
            website_url = source.website_url,
            registration_url = source.registration_url,
            overall_cutoff = source.overall_cutoff,
            avg_temp_high = source.avg_temp_high,
            avg_temp_low = source.avg_temp_low,
            weather_notes = source.weather_notes,
            timezone = source.timezone,
            terrain_type = source.terrain_type,
            weather_history = source.weather_history,
            course_record_male = source.course_record_male,
            course_record_female = source.course_record_female,
            qualifies_for = source.qualifies_for,
            racebook_url = source.racebook_url,
            racebook_last_updated = source.racebook_last_updated,
            briefing_url = source.briefing_url,
            briefing_datetime = source.briefing_datetime,
            packet_pickup_url = source.packet_pickup_url,
            packet_pickup_datetime = source.packet_pickup_datetime,
            packet_pickup_info = source.packet_pickup_info,
            past_results_url = source.past_results_url,
            media_url = source.media_url,
            entrants_url = source.entrants_url,
            tracking_url = source.tracking_url,
            lodging_info = source.lodging_info,
            drop_bag_template = source.drop_bag_template,
            resources_config = source.resources_config,
            weather_locations = source.weather_locations,
            sunrise_time = source.sunrise_time,
            sunset_time = source.sunset_time,
            moon_phase = source.moon_phase,
            precip_chance = source.precip_chance,
            updated_at = now()
        FROM races source
        WHERE source.id = p_source_race_id
          AND clone.id = v_clone_race_id;

        IF v_source_course_id IS NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO courses (
            race_id, official_source_course_id, total_distance_miles,
            total_elevation_gain_ft, total_elevation_loss_ft,
            max_elevation_ft, min_elevation_ft,
            elevation_samples, geometry, raw_gpx, created_at
        )
        SELECT
            v_clone_race_id, source.id, source.total_distance_miles,
            source.total_elevation_gain_ft, source.total_elevation_loss_ft,
            source.max_elevation_ft, source.min_elevation_ft,
            source.elevation_samples, source.geometry, source.raw_gpx, now()
        FROM courses source
        WHERE source.id = v_source_course_id
        ON CONFLICT (race_id) DO UPDATE
        SET
            official_source_course_id = EXCLUDED.official_source_course_id,
            total_distance_miles = EXCLUDED.total_distance_miles,
            total_elevation_gain_ft = EXCLUDED.total_elevation_gain_ft,
            total_elevation_loss_ft = EXCLUDED.total_elevation_loss_ft,
            max_elevation_ft = EXCLUDED.max_elevation_ft,
            min_elevation_ft = EXCLUDED.min_elevation_ft,
            elevation_samples = EXCLUDED.elevation_samples,
            geometry = EXCLUDED.geometry,
            raw_gpx = EXCLUDED.raw_gpx
        RETURNING id INTO v_clone_course_id;

        WITH source_ranked AS (
            SELECT
                id AS source_waypoint_id,
                row_number() OVER (ORDER BY mile, order_index, name, id) AS rn
            FROM waypoints
            WHERE course_id = v_source_course_id
        ),
        clone_ranked AS (
            SELECT
                id AS clone_waypoint_id,
                row_number() OVER (ORDER BY mile, order_index, name, id) AS rn
            FROM waypoints
            WHERE course_id = v_clone_course_id
              AND official_source_waypoint_id IS NULL
        )
        UPDATE waypoints clone_waypoint
        SET official_source_waypoint_id = source_ranked.source_waypoint_id
        FROM clone_ranked
        JOIN source_ranked ON source_ranked.rn = clone_ranked.rn
        WHERE clone_waypoint.id = clone_ranked.clone_waypoint_id
          AND NOT EXISTS (
              SELECT 1
              FROM waypoints existing
              WHERE existing.course_id = v_clone_course_id
                AND existing.official_source_waypoint_id = source_ranked.source_waypoint_id
          );

        INSERT INTO waypoints (
            course_id, official_source_waypoint_id, lat, lon, name,
            elevation_ft, type, crew_allowed, pacer_allowed, has_drop_bag,
            cutoff_time, mile, notes, drop_bag_items, drop_bag_name,
            drop_bag_notes, crew_relay_notes, runner_next_leg_notes,
            delay, order_index, created_at
        )
        SELECT
            v_clone_course_id, source.id, source.lat, source.lon, source.name,
            source.elevation_ft, source.type, source.crew_allowed, source.pacer_allowed, source.has_drop_bag,
            source.cutoff_time, source.mile, source.notes, source.drop_bag_items, source.drop_bag_name,
            source.drop_bag_notes, source.crew_relay_notes, source.runner_next_leg_notes,
            source.delay, source.order_index, now()
        FROM waypoints source
        WHERE source.course_id = v_source_course_id
        ON CONFLICT (course_id, official_source_waypoint_id) WHERE official_source_waypoint_id IS NOT NULL DO UPDATE
        SET
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            name = EXCLUDED.name,
            elevation_ft = EXCLUDED.elevation_ft,
            type = EXCLUDED.type,
            crew_allowed = EXCLUDED.crew_allowed,
            pacer_allowed = EXCLUDED.pacer_allowed,
            has_drop_bag = EXCLUDED.has_drop_bag,
            cutoff_time = EXCLUDED.cutoff_time,
            mile = EXCLUDED.mile,
            notes = EXCLUDED.notes,
            crew_relay_notes = EXCLUDED.crew_relay_notes,
            runner_next_leg_notes = EXCLUDED.runner_next_leg_notes,
            order_index = EXCLUDED.order_index;

        DELETE FROM waypoints clone_waypoint
        WHERE clone_waypoint.course_id = v_clone_course_id
          AND clone_waypoint.official_source_waypoint_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM waypoints source
              WHERE source.id = clone_waypoint.official_source_waypoint_id
                AND source.course_id = v_source_course_id
          );

        WITH source_ranked AS (
            SELECT
                id AS source_node_id,
                row_number() OVER (ORDER BY mile, lat, lon, id) AS rn
            FROM terrain_nodes
            WHERE course_id = v_source_course_id
        ),
        clone_ranked AS (
            SELECT
                id AS clone_node_id,
                row_number() OVER (ORDER BY mile, lat, lon, id) AS rn
            FROM terrain_nodes
            WHERE course_id = v_clone_course_id
              AND official_source_terrain_node_id IS NULL
        )
        UPDATE terrain_nodes clone_node
        SET official_source_terrain_node_id = source_ranked.source_node_id
        FROM clone_ranked
        JOIN source_ranked ON source_ranked.rn = clone_ranked.rn
        WHERE clone_node.id = clone_ranked.clone_node_id
          AND NOT EXISTS (
              SELECT 1
              FROM terrain_nodes existing
              WHERE existing.course_id = v_clone_course_id
                AND existing.official_source_terrain_node_id = source_ranked.source_node_id
          );

        INSERT INTO terrain_nodes (
            course_id, official_source_terrain_node_id,
            lat, lon, mile, type, difficulty, created_at
        )
        SELECT
            v_clone_course_id, source.id,
            source.lat, source.lon, source.mile, source.type, source.difficulty, now()
        FROM terrain_nodes source
        WHERE source.course_id = v_source_course_id
        ON CONFLICT (course_id, official_source_terrain_node_id) WHERE official_source_terrain_node_id IS NOT NULL DO UPDATE
        SET
            lat = EXCLUDED.lat,
            lon = EXCLUDED.lon,
            mile = EXCLUDED.mile,
            type = EXCLUDED.type,
            difficulty = EXCLUDED.difficulty;

        DELETE FROM terrain_nodes clone_node
        WHERE clone_node.course_id = v_clone_course_id
          AND clone_node.official_source_terrain_node_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM terrain_nodes source
              WHERE source.id = clone_node.official_source_terrain_node_id
                AND source.course_id = v_source_course_id
          );
    END LOOP;

    RETURN v_synced_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_official_race_to_clones(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_official_race_to_clones(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_official_race_to_clones_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source_race_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'races' THEN
        v_source_race_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    ELSIF TG_TABLE_NAME = 'courses' THEN
        v_source_race_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.race_id ELSE NEW.race_id END;
    ELSIF TG_TABLE_NAME = 'waypoints' THEN
        SELECT race_id INTO v_source_race_id
        FROM courses
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.course_id ELSE NEW.course_id END;
    ELSIF TG_TABLE_NAME = 'terrain_nodes' THEN
        SELECT race_id INTO v_source_race_id
        FROM courses
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.course_id ELSE NEW.course_id END;
    END IF;

    IF v_source_race_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM races WHERE id = v_source_race_id AND is_official = true) THEN
        PERFORM public.sync_official_race_to_clones(v_source_race_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_races ON races;
CREATE TRIGGER trg_sync_official_race_clones_on_races
AFTER INSERT OR UPDATE ON races
FOR EACH ROW EXECUTE FUNCTION public.sync_official_race_to_clones_trigger();

DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_courses ON courses;
CREATE TRIGGER trg_sync_official_race_clones_on_courses
AFTER INSERT OR UPDATE OR DELETE ON courses
FOR EACH ROW EXECUTE FUNCTION public.sync_official_race_to_clones_trigger();

DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_waypoints ON waypoints;
CREATE TRIGGER trg_sync_official_race_clones_on_waypoints
AFTER INSERT OR UPDATE OR DELETE ON waypoints
FOR EACH ROW EXECUTE FUNCTION public.sync_official_race_to_clones_trigger();

DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_terrain_nodes ON terrain_nodes;
CREATE TRIGGER trg_sync_official_race_clones_on_terrain_nodes
AFTER INSERT OR UPDATE OR DELETE ON terrain_nodes
FOR EACH ROW EXECUTE FUNCTION public.sync_official_race_to_clones_trigger();

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
        drop_bag_template, resources_config, weather_locations,
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
        drop_bag_template, resources_config, weather_locations,
        sunrise_time, sunset_time, moon_phase, precip_chance,
        false, null, null, p_race_id,
        NOW(), NOW()
    FROM races
    WHERE id = p_race_id
    RETURNING id INTO v_new_race_id;

    SELECT id INTO v_old_course_id FROM courses WHERE race_id = p_race_id LIMIT 1;

    IF v_old_course_id IS NOT NULL THEN
        INSERT INTO courses (
            race_id, official_source_course_id, total_distance_miles,
            total_elevation_gain_ft, total_elevation_loss_ft,
            max_elevation_ft, min_elevation_ft,
            elevation_samples, geometry, raw_gpx, created_at
        )
        SELECT
            v_new_race_id, id, total_distance_miles,
            total_elevation_gain_ft, total_elevation_loss_ft,
            max_elevation_ft, min_elevation_ft,
            elevation_samples, geometry, raw_gpx, NOW()
        FROM courses
        WHERE id = v_old_course_id
        RETURNING id INTO v_new_course_id;

        INSERT INTO waypoints (
            course_id, official_source_waypoint_id, lat, lon, name,
            elevation_ft, type,
            crew_allowed, pacer_allowed, has_drop_bag, cutoff_time, mile,
            notes, drop_bag_items, drop_bag_name, drop_bag_notes,
            crew_relay_notes, runner_next_leg_notes,
            delay, order_index, created_at
        )
        SELECT
            v_new_course_id, id, lat, lon, name,
            elevation_ft, type,
            crew_allowed, pacer_allowed, has_drop_bag, cutoff_time, mile,
            notes, drop_bag_items, drop_bag_name, drop_bag_notes,
            crew_relay_notes, runner_next_leg_notes,
            delay, order_index, NOW()
        FROM waypoints
        WHERE course_id = v_old_course_id;

        INSERT INTO terrain_nodes (
            course_id, official_source_terrain_node_id, lat, lon, mile, type, difficulty, created_at
        )
        SELECT
            v_new_course_id, id, lat, lon, mile, type, difficulty, NOW()
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
