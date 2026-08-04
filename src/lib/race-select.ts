/**
 * Race column list for PostgREST selects.
 * Excludes `public_share_token` (capability secret) — load that only via
 * `get_race_share_settings` for team managers / owners.
 */
export const RACE_SELECT = [
  'id',
  'user_id',
  'name',
  'location',
  'start_datetime',
  'timezone',
  'website_url',
  'registration_url',
  'entrants_url',
  'past_results_url',
  'tracking_url',
  'media_url',
  'racebook_url',
  'racebook_last_updated',
  'briefing_datetime',
  'briefing_url',
  'packet_pickup_datetime',
  'packet_pickup_url',
  'packet_pickup_info',
  'lodging_info',
  'distance_miles',
  'course_type',
  'terrain_type',
  'overall_cutoff',
  'course_record_male',
  'course_record_female',
  'qualifies_for',
  'avg_temp_high',
  'avg_temp_low',
  'precip_chance',
  'sunrise_time',
  'sunset_time',
  'moon_phase',
  'weather_notes',
  'weather_history',
  'weather_locations',
  'resources_config',
  'drop_bag_template',
  'is_public',
  'is_official',
  'official_at',
  'official_source_race_id',
  'official_revision',
  'merged_official_revision',
  'race_director_user_id',
  'public_share_enabled',
  'created_at',
  'updated_at',
].join(', ')

export type RaceShareSettings = {
  public_share_enabled: boolean
  public_share_token: string | null
}
