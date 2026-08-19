export const TRAINING_ROUTE_LIST_COLUMNS =
  'id,race_id,name,notes,distance_miles,elevation_gain_ft,elevation_loss_ft,geometry,start_lat,start_lon,finish_lat,finish_lon,overlap_miles,overlap_segments,strava_activity_inputs,strava_activity_results,sort_order,created_at,updated_at,created_by'

/** Large source GPX and elevation samples are loaded only for the selected detail route. */
export const TRAINING_ROUTE_DETAIL_COLUMNS = 'id,raw_gpx,elevation_samples'
