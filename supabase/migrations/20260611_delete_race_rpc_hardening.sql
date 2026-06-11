-- Harden event deletion so race-level check-ins are removed even if course data
-- is already missing or partially inconsistent.
CREATE OR REPLACE FUNCTION public.delete_race(p_race_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_course_ids uuid[] := ARRAY[]::uuid[];
    v_deleted_id uuid;
BEGIN
    IF p_race_id IS NULL THEN
        RAISE EXCEPTION 'Race id is required';
    END IF;

    IF NOT public.user_owns_race(p_race_id) THEN
        RAISE EXCEPTION 'Not authorized to delete this race';
    END IF;

    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_course_ids
    FROM courses
    WHERE race_id = p_race_id;

    UPDATE races
    SET official_source_race_id = NULL
    WHERE official_source_race_id = p_race_id;

    DELETE FROM runner_checkins
    WHERE race_id = p_race_id;

    IF array_length(v_course_ids, 1) IS NOT NULL THEN
        UPDATE courses
        SET official_source_course_id = NULL
        WHERE official_source_course_id = ANY(v_course_ids);

        UPDATE waypoints
        SET official_source_waypoint_id = NULL
        WHERE official_source_waypoint_id IN (
            SELECT id FROM waypoints WHERE course_id = ANY(v_course_ids)
        );

        UPDATE terrain_nodes
        SET official_source_terrain_node_id = NULL
        WHERE official_source_terrain_node_id IN (
            SELECT id FROM terrain_nodes WHERE course_id = ANY(v_course_ids)
        );

        DELETE FROM runner_checkins
        WHERE waypoint_id IN (
            SELECT id FROM waypoints WHERE course_id = ANY(v_course_ids)
        );

        DELETE FROM terrain_nodes
        WHERE course_id = ANY(v_course_ids);

        DELETE FROM waypoints
        WHERE course_id = ANY(v_course_ids);

        DELETE FROM courses
        WHERE id = ANY(v_course_ids);
    END IF;

    DELETE FROM runner_locations
    WHERE race_id = p_race_id;

    DELETE FROM race_pace_plans
    WHERE race_id = p_race_id;

    DELETE FROM pending_race_memberships
    WHERE race_id = p_race_id;

    DELETE FROM race_memberships
    WHERE race_id = p_race_id;

    DELETE FROM races
    WHERE id = p_race_id
    RETURNING id INTO v_deleted_id;

    IF v_deleted_id IS NULL THEN
        RAISE EXCEPTION 'Race not found';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_race(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_race(uuid) TO authenticated;
