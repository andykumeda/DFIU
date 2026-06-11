-- Preserve a cloned event's custom title when official-source updates are
-- synced into private plans.
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
