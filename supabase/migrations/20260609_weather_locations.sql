-- Additional weather sample locations along the course (besides the race location).

ALTER TABLE races
    ADD COLUMN IF NOT EXISTS weather_locations jsonb;

-- Keep clone_race in sync with the new column.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
