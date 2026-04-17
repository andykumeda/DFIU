-- Add drop bag name and notes
ALTER TABLE waypoints
ADD COLUMN IF NOT EXISTS drop_bag_name text,
ADD COLUMN IF NOT EXISTS drop_bag_notes text;

-- Create function to clone a race and all its related data
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

    -- 1. CLONE THE RACE
    INSERT INTO races (
        user_id, name, description, is_public, start_datetime,
        distance, distance_unit, elevation_gain, elevation_loss, elevation_unit,
        city, state, country, website_url, overall_cutoff,
        avg_temp_high, avg_temp_low, weather_notes, map_style, theme_color,
        created_at, updated_at
    )
    SELECT
        v_user_id, name || ' (Copy)', description, false, start_datetime,
        distance, distance_unit, elevation_gain, elevation_loss, elevation_unit,
        city, state, country, website_url, overall_cutoff,
        avg_temp_high, avg_temp_low, weather_notes, map_style, theme_color,
        NOW(), NOW()
    FROM races
    WHERE id = p_race_id
    RETURNING id INTO v_new_race_id;

    -- 2. CLONE THE COURSE
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

        -- 3. CLONE WAYPOINTS
        INSERT INTO waypoints (
            course_id, lat, lon, name, description,
            distance_from_start, elevation, type,
            crew_allowed, pacer_allowed, has_drop_bag, cut_off_time, mile,
            drop_bag_items, drop_bag_name, drop_bag_notes,
            created_at, updated_at
        )
        SELECT
            v_new_course_id, lat, lon, name, description,
            distance_from_start, elevation, type,
            crew_allowed, pacer_allowed, has_drop_bag, cut_off_time, mile,
            drop_bag_items, drop_bag_name, drop_bag_notes,
            NOW(), NOW()
        FROM waypoints
        WHERE course_id = v_old_course_id;

        -- 4. CLONE TERRAIN NODES
        INSERT INTO terrain_nodes (
            course_id, lat, lon, mile, type, difficulty, created_at
        )
        SELECT
            v_new_course_id, lat, lon, mile, type, difficulty, NOW()
        FROM terrain_nodes
        WHERE course_id = v_old_course_id;
    END IF;

    RETURN v_new_race_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
