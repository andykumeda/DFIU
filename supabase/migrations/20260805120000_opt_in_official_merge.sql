-- Opt-in official merge: stop automatic clone sync; track revisions;
-- expose per-clone sync / dismiss / update-status RPCs.

-- 1) Drop automatic push-sync triggers
DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_races ON races;
DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_courses ON courses;
DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_waypoints ON waypoints;
DROP TRIGGER IF EXISTS trg_sync_official_race_clones_on_terrain_nodes ON terrain_nodes;
DROP FUNCTION IF EXISTS public.sync_official_race_to_clones_trigger();

-- 2) Revision columns
ALTER TABLE races
  ADD COLUMN IF NOT EXISTS official_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS merged_official_revision integer;

-- Existing clones: treat current source revision as already merged (no false "updates available")
UPDATE races clone
SET merged_official_revision = COALESCE(source.official_revision, 1)
FROM races source
WHERE clone.official_source_race_id = source.id
  AND clone.merged_official_revision IS NULL;

-- 3) Bump official revision when official source content changes
CREATE OR REPLACE FUNCTION public.bump_official_revision(p_source_race_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revision integer;
BEGIN
  UPDATE races
  SET
    official_revision = official_revision + 1,
    updated_at = now()
  WHERE id = p_source_race_id
    AND is_official = true
  RETURNING official_revision INTO v_revision;

  RETURN COALESCE(v_revision, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_official_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_official_revision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_bump_official_revision_on_race()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.is_official = true
     AND (
       NEW.start_datetime IS DISTINCT FROM OLD.start_datetime
       OR NEW.distance_miles IS DISTINCT FROM OLD.distance_miles
       OR NEW.course_type IS DISTINCT FROM OLD.course_type
       OR NEW.location IS DISTINCT FROM OLD.location
       OR NEW.website_url IS DISTINCT FROM OLD.website_url
       OR NEW.registration_url IS DISTINCT FROM OLD.registration_url
       OR NEW.overall_cutoff IS DISTINCT FROM OLD.overall_cutoff
       OR NEW.avg_temp_high IS DISTINCT FROM OLD.avg_temp_high
       OR NEW.avg_temp_low IS DISTINCT FROM OLD.avg_temp_low
       OR NEW.weather_notes IS DISTINCT FROM OLD.weather_notes
       OR NEW.timezone IS DISTINCT FROM OLD.timezone
       OR NEW.terrain_type IS DISTINCT FROM OLD.terrain_type
       OR NEW.weather_history IS DISTINCT FROM OLD.weather_history
       OR NEW.course_record_male IS DISTINCT FROM OLD.course_record_male
       OR NEW.course_record_female IS DISTINCT FROM OLD.course_record_female
       OR NEW.qualifies_for IS DISTINCT FROM OLD.qualifies_for
       OR NEW.racebook_url IS DISTINCT FROM OLD.racebook_url
       OR NEW.racebook_last_updated IS DISTINCT FROM OLD.racebook_last_updated
       OR NEW.briefing_url IS DISTINCT FROM OLD.briefing_url
       OR NEW.briefing_datetime IS DISTINCT FROM OLD.briefing_datetime
       OR NEW.packet_pickup_url IS DISTINCT FROM OLD.packet_pickup_url
       OR NEW.packet_pickup_datetime IS DISTINCT FROM OLD.packet_pickup_datetime
       OR NEW.packet_pickup_info IS DISTINCT FROM OLD.packet_pickup_info
       OR NEW.past_results_url IS DISTINCT FROM OLD.past_results_url
       OR NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.entrants_url IS DISTINCT FROM OLD.entrants_url
       OR NEW.tracking_url IS DISTINCT FROM OLD.tracking_url
       OR NEW.lodging_info IS DISTINCT FROM OLD.lodging_info
       OR NEW.drop_bag_template IS DISTINCT FROM OLD.drop_bag_template
       OR NEW.resources_config IS DISTINCT FROM OLD.resources_config
       OR NEW.weather_locations IS DISTINCT FROM OLD.weather_locations
       OR NEW.sunrise_time IS DISTINCT FROM OLD.sunrise_time
       OR NEW.sunset_time IS DISTINCT FROM OLD.sunset_time
       OR NEW.moon_phase IS DISTINCT FROM OLD.moon_phase
       OR NEW.precip_chance IS DISTINCT FROM OLD.precip_chance
       OR NEW.name IS DISTINCT FROM OLD.name
     ) THEN
    NEW.official_revision := OLD.official_revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_official_revision_on_race ON races;
CREATE TRIGGER trg_bump_official_revision_on_race
BEFORE UPDATE ON races
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_official_revision_on_race();

CREATE OR REPLACE FUNCTION public.trg_bump_official_revision_on_course_graph()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_race_id uuid;
  v_course_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'courses' THEN
    v_race_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.race_id ELSE NEW.race_id END;
  ELSE
    v_course_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.course_id ELSE NEW.course_id END;
    SELECT race_id INTO v_race_id FROM courses WHERE id = v_course_id;
  END IF;

  IF v_race_id IS NOT NULL THEN
    PERFORM public.bump_official_revision(v_race_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_official_revision_on_courses ON courses;
CREATE TRIGGER trg_bump_official_revision_on_courses
AFTER INSERT OR UPDATE OR DELETE ON courses
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_official_revision_on_course_graph();

DROP TRIGGER IF EXISTS trg_bump_official_revision_on_waypoints ON waypoints;
CREATE TRIGGER trg_bump_official_revision_on_waypoints
AFTER INSERT OR UPDATE OR DELETE ON waypoints
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_official_revision_on_course_graph();

DROP TRIGGER IF EXISTS trg_bump_official_revision_on_terrain_nodes ON terrain_nodes;
CREATE TRIGGER trg_bump_official_revision_on_terrain_nodes
AFTER INSERT OR UPDATE OR DELETE ON terrain_nodes
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_official_revision_on_course_graph();

-- 4) Sync one clone from its official source (internal: no auth)
CREATE OR REPLACE FUNCTION public._sync_official_race_to_clone_internal(p_clone_race_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_race_id uuid;
  v_source_course_id uuid;
  v_clone_course_id uuid;
  v_source_revision integer;
BEGIN
  SELECT official_source_race_id INTO v_source_race_id
  FROM races
  WHERE id = p_clone_race_id;

  IF v_source_race_id IS NULL THEN
    RAISE EXCEPTION 'Race is not a clone of an official source';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM races
    WHERE id = v_source_race_id AND is_official = true
  ) THEN
    RAISE EXCEPTION 'Official source race not found';
  END IF;

  SELECT official_revision INTO v_source_revision
  FROM races WHERE id = v_source_race_id;

  SELECT id INTO v_source_course_id
  FROM courses
  WHERE race_id = v_source_race_id
  LIMIT 1;

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
    merged_official_revision = v_source_revision,
    updated_at = now()
  FROM races source
  WHERE source.id = v_source_race_id
    AND clone.id = p_clone_race_id;

  IF v_source_course_id IS NULL THEN
    RETURN true;
  END IF;

  INSERT INTO courses (
    race_id, official_source_course_id, total_distance_miles,
    total_elevation_gain_ft, total_elevation_loss_ft,
    max_elevation_ft, min_elevation_ft,
    elevation_samples, geometry, raw_gpx, created_at
  )
  SELECT
    p_clone_race_id, source.id, source.total_distance_miles,
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

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sync_official_race_to_clone_internal(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_official_race_to_clone(p_clone_race_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.user_owns_race(p_clone_race_id)
    OR public.user_can_edit_race(p_clone_race_id)
    OR public.user_is_site_admin()
  ) THEN
    RAISE EXCEPTION 'Not authorized to sync this race';
  END IF;

  RETURN public._sync_official_race_to_clone_internal(p_clone_race_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_official_race_to_clone(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_official_race_to_clone(uuid) TO authenticated;

-- Bulk helper: sync every clone (manual/admin); no longer auto-triggered
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
  IF NOT EXISTS (
    SELECT 1 FROM races
    WHERE id = p_source_race_id AND is_official = true
  ) THEN
    RETURN 0;
  END IF;

  IF NOT (
    public.user_is_site_admin()
    OR public.user_owns_race(p_source_race_id)
    OR public.user_can_edit_race(p_source_race_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to sync clones for this race';
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

REVOKE EXECUTE ON FUNCTION public.sync_official_race_to_clones(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_official_race_to_clones(uuid) TO authenticated;

-- 5) Update status + dismiss
CREATE OR REPLACE FUNCTION public.get_clone_update_status(p_race_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_source_id uuid;
  v_merged integer;
  v_source_revision integer;
  v_source_updated_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('has_updates', false);
  END IF;

  IF NOT public.user_can_view_race(p_race_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT
    clone.official_source_race_id,
    clone.merged_official_revision,
    source.official_revision,
    source.updated_at
  INTO
    v_source_id,
    v_merged,
    v_source_revision,
    v_source_updated_at
  FROM races clone
  LEFT JOIN races source ON source.id = clone.official_source_race_id AND source.is_official = true
  WHERE clone.id = p_race_id;

  IF v_source_id IS NULL OR v_source_revision IS NULL THEN
    RETURN jsonb_build_object(
      'has_updates', false,
      'source_revision', null,
      'merged_revision', v_merged,
      'source_updated_at', null
    );
  END IF;

  RETURN jsonb_build_object(
    'has_updates', COALESCE(v_merged, 0) < v_source_revision,
    'source_revision', v_source_revision,
    'merged_revision', v_merged,
    'source_updated_at', v_source_updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clone_update_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clone_update_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_clone_official_update(p_race_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_revision integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.user_owns_race(p_race_id)
    OR public.user_can_edit_race(p_race_id)
    OR public.user_is_site_admin()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT source.official_revision INTO v_source_revision
  FROM races clone
  JOIN races source ON source.id = clone.official_source_race_id AND source.is_official = true
  WHERE clone.id = p_race_id;

  IF v_source_revision IS NULL THEN
    RAISE EXCEPTION 'No official source to dismiss';
  END IF;

  UPDATE races
  SET
    merged_official_revision = v_source_revision,
    updated_at = now()
  WHERE id = p_race_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dismiss_clone_official_update(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_clone_official_update(uuid) TO authenticated;

-- 6) clone_race sets merged_official_revision from source
CREATE OR REPLACE FUNCTION clone_race(p_race_id UUID)
RETURNS UUID AS $$
DECLARE
    v_new_race_id UUID;
    v_user_id UUID;
    v_old_course_id UUID;
    v_new_course_id UUID;
    v_source_revision integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT official_revision INTO v_source_revision
    FROM races WHERE id = p_race_id;

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
        merged_official_revision,
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
        COALESCE(v_source_revision, 1),
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

    INSERT INTO training_routes (
        race_id, name, notes,
        distance_miles, elevation_gain_ft, elevation_loss_ft,
        geometry, elevation_samples, raw_gpx,
        start_lat, start_lon, finish_lat, finish_lon,
        overlap_miles, overlap_segments,
        sort_order, created_at, updated_at, created_by
    )
    SELECT
        v_new_race_id, name, notes,
        distance_miles, elevation_gain_ft, elevation_loss_ft,
        geometry, elevation_samples, raw_gpx,
        start_lat, start_lon, finish_lat, finish_lon,
        overlap_miles, overlap_segments,
        sort_order, NOW(), NOW(), v_user_id
    FROM training_routes
    WHERE race_id = p_race_id;

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
