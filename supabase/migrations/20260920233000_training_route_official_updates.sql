-- Track official training-route identity, include official route changes in the
-- revision stream, and let clone owners accept route-library updates without
-- replacing their Strava analysis or personal-only routes.

ALTER TABLE public.training_routes
  ADD COLUMN IF NOT EXISTS official_source_training_route_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_routes_official_source_fkey'
      AND conrelid = 'public.training_routes'::regclass
  ) THEN
    ALTER TABLE public.training_routes
      ADD CONSTRAINT training_routes_official_source_fkey
      FOREIGN KEY (official_source_training_route_id)
      REFERENCES public.training_routes(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS training_routes_source_per_race_idx
  ON public.training_routes(race_id, official_source_training_route_id)
  WHERE official_source_training_route_id IS NOT NULL;

-- Link routes copied before source identity existed. Exact geometry + overlap
-- wins, which disambiguates same-path official variants; name/distance is only
-- a final fallback. Each source route can be assigned once per clone.
WITH candidates AS (
  SELECT clone_route.id AS clone_route_id, clone_route.race_id AS clone_race_id,
    source_route.id AS source_route_id,
    row_number() OVER (
      PARTITION BY clone_route.id
      ORDER BY
        CASE
          WHEN clone_route.geometry IS NOT DISTINCT FROM source_route.geometry
            AND clone_route.overlap_segments IS NOT DISTINCT FROM source_route.overlap_segments THEN 0
          WHEN clone_route.geometry IS NOT DISTINCT FROM source_route.geometry THEN 1
          ELSE 2
        END,
        abs(clone_route.sort_order - source_route.sort_order),
        source_route.created_at,
        source_route.id
    ) AS clone_choice
  FROM public.training_routes clone_route
  JOIN public.races clone_race ON clone_race.id = clone_route.race_id
  JOIN public.training_routes source_route
    ON source_route.race_id = clone_race.official_source_race_id
   AND (
     clone_route.geometry IS NOT DISTINCT FROM source_route.geometry
     OR (
       clone_route.name = source_route.name
       AND clone_route.distance_miles IS NOT DISTINCT FROM source_route.distance_miles
     )
   )
  WHERE clone_route.official_source_training_route_id IS NULL
), preferred AS (
  SELECT *, row_number() OVER (
    PARTITION BY clone_race_id, source_route_id
    ORDER BY clone_choice, clone_route_id
  ) AS source_choice
  FROM candidates
  WHERE clone_choice = 1
)
UPDATE public.training_routes clone_route
SET official_source_training_route_id = preferred.source_route_id
FROM preferred
WHERE clone_route.id = preferred.clone_route_id
  AND preferred.source_choice = 1;

CREATE OR REPLACE FUNCTION public.trg_bump_official_revision_on_training_routes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_race_id uuid;
BEGIN
  v_race_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.race_id ELSE NEW.race_id END;

  IF TG_OP = 'UPDATE' AND NOT (
    NEW.name IS DISTINCT FROM OLD.name
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.distance_miles IS DISTINCT FROM OLD.distance_miles
    OR NEW.elevation_gain_ft IS DISTINCT FROM OLD.elevation_gain_ft
    OR NEW.elevation_loss_ft IS DISTINCT FROM OLD.elevation_loss_ft
    OR NEW.geometry IS DISTINCT FROM OLD.geometry
    OR NEW.elevation_samples IS DISTINCT FROM OLD.elevation_samples
    OR NEW.raw_gpx IS DISTINCT FROM OLD.raw_gpx
    OR NEW.start_lat IS DISTINCT FROM OLD.start_lat
    OR NEW.start_lon IS DISTINCT FROM OLD.start_lon
    OR NEW.finish_lat IS DISTINCT FROM OLD.finish_lat
    OR NEW.finish_lon IS DISTINCT FROM OLD.finish_lon
    OR NEW.overlap_miles IS DISTINCT FROM OLD.overlap_miles
    OR NEW.overlap_segments IS DISTINCT FROM OLD.overlap_segments
    OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.bump_official_revision(v_race_id);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_official_revision_on_training_routes ON public.training_routes;
CREATE TRIGGER trg_bump_official_revision_on_training_routes
AFTER INSERT OR UPDATE OR DELETE ON public.training_routes
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_official_revision_on_training_routes();

-- Catch official route changes made before the trigger existed. This advances
-- each affected source once, regardless of how many routes changed.
UPDATE public.races source
SET official_revision = source.official_revision + 1, updated_at = now()
WHERE source.is_official = true
  AND EXISTS (
    SELECT 1 FROM public.training_routes route
    WHERE route.race_id = source.id AND route.updated_at > source.updated_at
  );

-- Preserve the existing clone implementation and add source links immediately
-- after it copies the route library.
ALTER FUNCTION public.clone_race(uuid) RENAME TO _clone_race_without_training_links;
REVOKE EXECUTE ON FUNCTION public._clone_race_without_training_links(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clone_race(p_race_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_race_id uuid;
BEGIN
  v_new_race_id := public._clone_race_without_training_links(p_race_id);

  WITH source_ranked AS (
    SELECT id, row_number() OVER (ORDER BY sort_order, name, created_at, id) AS rn
    FROM training_routes WHERE race_id = p_race_id
  ), clone_ranked AS (
    SELECT id, row_number() OVER (ORDER BY sort_order, name, created_at, id) AS rn
    FROM training_routes WHERE race_id = v_new_race_id
  )
  UPDATE training_routes clone_route
  SET official_source_training_route_id = source_route.id
  FROM clone_ranked
  JOIN source_ranked source_route ON source_route.rn = clone_ranked.rn
  WHERE clone_route.id = clone_ranked.id;

  RETURN v_new_race_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clone_race(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clone_race(uuid) TO authenticated;

-- Let clone owners review and apply official changes by area. Unselected areas
-- remain local; completing the review marks the current source revision handled.

CREATE OR REPLACE FUNCTION public.sync_selected_official_updates(
  p_clone_race_id uuid,
  p_sections text[] DEFAULT ARRAY[]::text[]
)
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
  v_allowed constant text[] := ARRAY['event', 'resources', 'drop_bag_template', 'course', 'waypoints', 'terrain', 'training_routes'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.user_owns_race(p_clone_race_id) OR public.user_can_edit_race(p_clone_race_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_sections, ARRAY[]::text[])) s WHERE NOT (s = ANY(v_allowed))) THEN
    RAISE EXCEPTION 'Unknown official update section';
  END IF;

  SELECT official_source_race_id INTO v_source_race_id FROM races WHERE id = p_clone_race_id;
  IF v_source_race_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM races WHERE id = v_source_race_id AND is_official = true
  ) THEN RAISE EXCEPTION 'Official source race not found'; END IF;

  SELECT official_revision INTO v_source_revision FROM races WHERE id = v_source_race_id;
  SELECT id INTO v_source_course_id FROM courses WHERE race_id = v_source_race_id LIMIT 1;
  SELECT id INTO v_clone_course_id FROM courses WHERE race_id = p_clone_race_id LIMIT 1;

  IF 'event' = ANY(p_sections) THEN
    UPDATE races clone SET
      start_datetime = source.start_datetime, distance_miles = source.distance_miles,
      course_type = source.course_type, location = source.location,
      website_url = source.website_url, registration_url = source.registration_url,
      overall_cutoff = source.overall_cutoff, avg_temp_high = source.avg_temp_high,
      avg_temp_low = source.avg_temp_low, weather_notes = source.weather_notes,
      timezone = source.timezone, terrain_type = source.terrain_type,
      weather_history = source.weather_history, course_record_male = source.course_record_male,
      course_record_female = source.course_record_female, qualifies_for = source.qualifies_for,
      weather_locations = source.weather_locations, sunrise_time = source.sunrise_time,
      sunset_time = source.sunset_time, moon_phase = source.moon_phase,
      precip_chance = source.precip_chance, updated_at = now()
    FROM races source WHERE source.id = v_source_race_id AND clone.id = p_clone_race_id;
  END IF;

  IF 'resources' = ANY(p_sections) THEN
    UPDATE races clone SET
      racebook_url = source.racebook_url, racebook_last_updated = source.racebook_last_updated,
      briefing_url = source.briefing_url, briefing_datetime = source.briefing_datetime,
      packet_pickup_url = source.packet_pickup_url,
      packet_pickup_datetime = source.packet_pickup_datetime,
      packet_pickup_info = source.packet_pickup_info,
      past_results_url = source.past_results_url, media_url = source.media_url,
      entrants_url = source.entrants_url, tracking_url = source.tracking_url,
      lodging_info = source.lodging_info, resources_config = source.resources_config,
      updated_at = now()
    FROM races source WHERE source.id = v_source_race_id AND clone.id = p_clone_race_id;
  END IF;

  IF 'drop_bag_template' = ANY(p_sections) THEN
    UPDATE races clone SET drop_bag_template = source.drop_bag_template, updated_at = now()
    FROM races source WHERE source.id = v_source_race_id AND clone.id = p_clone_race_id;
  END IF;

  IF v_source_course_id IS NOT NULL AND 'course' = ANY(p_sections) THEN
    INSERT INTO courses (
      race_id, official_source_course_id, total_distance_miles, total_elevation_gain_ft,
      total_elevation_loss_ft, max_elevation_ft, min_elevation_ft,
      elevation_samples, geometry, raw_gpx, created_at
    ) SELECT p_clone_race_id, id, total_distance_miles, total_elevation_gain_ft,
      total_elevation_loss_ft, max_elevation_ft, min_elevation_ft,
      elevation_samples, geometry, raw_gpx, now()
    FROM courses WHERE id = v_source_course_id
    ON CONFLICT (race_id) DO UPDATE SET
      official_source_course_id = EXCLUDED.official_source_course_id,
      total_distance_miles = EXCLUDED.total_distance_miles,
      total_elevation_gain_ft = EXCLUDED.total_elevation_gain_ft,
      total_elevation_loss_ft = EXCLUDED.total_elevation_loss_ft,
      max_elevation_ft = EXCLUDED.max_elevation_ft, min_elevation_ft = EXCLUDED.min_elevation_ft,
      elevation_samples = EXCLUDED.elevation_samples, geometry = EXCLUDED.geometry,
      raw_gpx = EXCLUDED.raw_gpx
    RETURNING id INTO v_clone_course_id;
  END IF;

  IF v_source_course_id IS NOT NULL AND v_clone_course_id IS NOT NULL AND 'waypoints' = ANY(p_sections) THEN
    -- Older clones may predate source links. Pair their existing stations with
    -- the source before upserting so accepting an update does not duplicate them.
    WITH source_ranked AS (
      SELECT id AS source_waypoint_id,
        row_number() OVER (ORDER BY mile, order_index, name, id) AS rn
      FROM waypoints WHERE course_id = v_source_course_id
    ), clone_ranked AS (
      SELECT id AS clone_waypoint_id,
        row_number() OVER (ORDER BY mile, order_index, name, id) AS rn
      FROM waypoints
      WHERE course_id = v_clone_course_id AND official_source_waypoint_id IS NULL
    )
    UPDATE waypoints clone_waypoint
    SET official_source_waypoint_id = source_ranked.source_waypoint_id
    FROM clone_ranked
    JOIN source_ranked ON source_ranked.rn = clone_ranked.rn
    WHERE clone_waypoint.id = clone_ranked.clone_waypoint_id
      AND NOT EXISTS (
        SELECT 1 FROM waypoints existing
        WHERE existing.course_id = v_clone_course_id
          AND existing.official_source_waypoint_id = source_ranked.source_waypoint_id
      );

    INSERT INTO waypoints (
      course_id, official_source_waypoint_id, lat, lon, name, elevation_ft, type,
      crew_allowed, pacer_allowed, has_drop_bag, cutoff_time, mile, notes,
      drop_bag_items, drop_bag_name, drop_bag_notes, crew_relay_notes,
      runner_next_leg_notes, delay, order_index, created_at
    ) SELECT v_clone_course_id, source.id, source.lat, source.lon, source.name,
      source.elevation_ft, source.type, source.crew_allowed, source.pacer_allowed,
      source.has_drop_bag, source.cutoff_time, source.mile, source.notes,
      source.drop_bag_items, source.drop_bag_name, source.drop_bag_notes,
      source.crew_relay_notes, source.runner_next_leg_notes, source.delay,
      source.order_index, now()
    FROM waypoints source WHERE source.course_id = v_source_course_id
    ON CONFLICT (course_id, official_source_waypoint_id)
      WHERE official_source_waypoint_id IS NOT NULL DO UPDATE SET
      lat = EXCLUDED.lat, lon = EXCLUDED.lon, name = EXCLUDED.name,
      elevation_ft = EXCLUDED.elevation_ft, type = EXCLUDED.type,
      crew_allowed = EXCLUDED.crew_allowed, pacer_allowed = EXCLUDED.pacer_allowed,
      has_drop_bag = EXCLUDED.has_drop_bag, cutoff_time = EXCLUDED.cutoff_time,
      mile = EXCLUDED.mile, notes = EXCLUDED.notes,
      crew_relay_notes = EXCLUDED.crew_relay_notes,
      runner_next_leg_notes = EXCLUDED.runner_next_leg_notes,
      order_index = EXCLUDED.order_index;

    DELETE FROM waypoints clone_waypoint
    WHERE clone_waypoint.course_id = v_clone_course_id
      AND clone_waypoint.official_source_waypoint_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM waypoints source
        WHERE source.id = clone_waypoint.official_source_waypoint_id
          AND source.course_id = v_source_course_id
      );
  END IF;

  IF v_source_course_id IS NOT NULL AND v_clone_course_id IS NOT NULL AND 'terrain' = ANY(p_sections) THEN
    WITH source_ranked AS (
      SELECT id AS source_node_id,
        row_number() OVER (ORDER BY mile, lat, lon, id) AS rn
      FROM terrain_nodes WHERE course_id = v_source_course_id
    ), clone_ranked AS (
      SELECT id AS clone_node_id,
        row_number() OVER (ORDER BY mile, lat, lon, id) AS rn
      FROM terrain_nodes
      WHERE course_id = v_clone_course_id AND official_source_terrain_node_id IS NULL
    )
    UPDATE terrain_nodes clone_node
    SET official_source_terrain_node_id = source_ranked.source_node_id
    FROM clone_ranked
    JOIN source_ranked ON source_ranked.rn = clone_ranked.rn
    WHERE clone_node.id = clone_ranked.clone_node_id
      AND NOT EXISTS (
        SELECT 1 FROM terrain_nodes existing
        WHERE existing.course_id = v_clone_course_id
          AND existing.official_source_terrain_node_id = source_ranked.source_node_id
      );

    INSERT INTO terrain_nodes (
      course_id, official_source_terrain_node_id, lat, lon, mile, type, difficulty, created_at
    ) SELECT v_clone_course_id, source.id, source.lat, source.lon, source.mile,
      source.type, source.difficulty, now()
    FROM terrain_nodes source WHERE source.course_id = v_source_course_id
    ON CONFLICT (course_id, official_source_terrain_node_id)
      WHERE official_source_terrain_node_id IS NOT NULL DO UPDATE SET
      lat = EXCLUDED.lat, lon = EXCLUDED.lon, mile = EXCLUDED.mile,
      type = EXCLUDED.type, difficulty = EXCLUDED.difficulty;

    DELETE FROM terrain_nodes clone_node
    WHERE clone_node.course_id = v_clone_course_id
      AND clone_node.official_source_terrain_node_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM terrain_nodes source
        WHERE source.id = clone_node.official_source_terrain_node_id
          AND source.course_id = v_source_course_id
      );
  END IF;

  IF 'training_routes' = ANY(p_sections) THEN
    INSERT INTO training_routes (
      race_id, official_source_training_route_id, name, notes,
      distance_miles, elevation_gain_ft, elevation_loss_ft,
      geometry, elevation_samples, raw_gpx,
      start_lat, start_lon, finish_lat, finish_lon,
      overlap_miles, overlap_segments,
      strava_activity_inputs, strava_activity_results,
      sort_order, created_at, updated_at, created_by
    )
    SELECT p_clone_race_id, source.id, source.name, source.notes,
      source.distance_miles, source.elevation_gain_ft, source.elevation_loss_ft,
      source.geometry, source.elevation_samples, source.raw_gpx,
      source.start_lat, source.start_lon, source.finish_lat, source.finish_lon,
      source.overlap_miles, source.overlap_segments,
      '[]'::jsonb, '[]'::jsonb,
      source.sort_order, now(), now(), auth.uid()
    FROM training_routes source
    WHERE source.race_id = v_source_race_id
    ON CONFLICT (race_id, official_source_training_route_id)
      WHERE official_source_training_route_id IS NOT NULL DO UPDATE SET
      name = EXCLUDED.name, notes = EXCLUDED.notes,
      distance_miles = EXCLUDED.distance_miles,
      elevation_gain_ft = EXCLUDED.elevation_gain_ft,
      elevation_loss_ft = EXCLUDED.elevation_loss_ft,
      geometry = EXCLUDED.geometry,
      elevation_samples = EXCLUDED.elevation_samples,
      raw_gpx = EXCLUDED.raw_gpx,
      start_lat = EXCLUDED.start_lat, start_lon = EXCLUDED.start_lon,
      finish_lat = EXCLUDED.finish_lat, finish_lon = EXCLUDED.finish_lon,
      overlap_miles = EXCLUDED.overlap_miles,
      overlap_segments = EXCLUDED.overlap_segments,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

    -- A removed official route becomes a personal route. This intentionally
    -- retains its Strava inputs/results and all saved route data.
    UPDATE training_routes clone_route
    SET official_source_training_route_id = NULL, updated_at = now()
    WHERE clone_route.race_id = p_clone_race_id
      AND clone_route.official_source_training_route_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM training_routes source
        WHERE source.id = clone_route.official_source_training_route_id
          AND source.race_id = v_source_race_id
      );
  END IF;

  UPDATE races SET merged_official_revision = v_source_revision, updated_at = now()
  WHERE id = p_clone_race_id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_selected_official_updates(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_selected_official_updates(uuid, text[]) TO authenticated;
