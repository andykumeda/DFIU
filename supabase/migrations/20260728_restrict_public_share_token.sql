-- Restrict public_share_token reads to team managers / owners / site admins.
-- Broad race selects must omit this column (see src/lib/race-select.ts).
--
-- Postgres note: table-level SELECT implies every column. Column-only REVOKE
-- does not remove access when SELECT was granted on the whole table. So we
-- revoke table SELECT and re-grant every column except public_share_token.

CREATE OR REPLACE FUNCTION public.get_race_share_settings(rid uuid)
RETURNS TABLE (public_share_enabled boolean, public_share_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.user_can_manage_team(rid)
    OR public.user_owns_race(rid)
    OR public.user_is_site_admin()
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.public_share_enabled, r.public_share_token
  FROM public.races r
  WHERE r.id = rid;
END;
$$;

REVOKE ALL ON FUNCTION public.get_race_share_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_race_share_settings(uuid) TO authenticated;

REVOKE SELECT ON TABLE public.races FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  name,
  location,
  start_datetime,
  timezone,
  website_url,
  registration_url,
  entrants_url,
  past_results_url,
  tracking_url,
  media_url,
  racebook_url,
  racebook_last_updated,
  briefing_datetime,
  briefing_url,
  packet_pickup_datetime,
  packet_pickup_url,
  packet_pickup_info,
  lodging_info,
  distance_miles,
  course_type,
  terrain_type,
  overall_cutoff,
  course_record_male,
  course_record_female,
  qualifies_for,
  avg_temp_high,
  avg_temp_low,
  precip_chance,
  sunrise_time,
  sunset_time,
  moon_phase,
  weather_notes,
  weather_history,
  weather_locations,
  resources_config,
  drop_bag_template,
  is_public,
  is_official,
  official_at,
  official_source_race_id,
  race_director_user_id,
  public_share_enabled,
  created_at,
  updated_at
) ON TABLE public.races TO anon, authenticated;
