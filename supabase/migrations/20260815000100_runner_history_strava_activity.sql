-- Link selected Strava race activities into runner_history for ability calibration.

ALTER TABLE runner_history
  ADD COLUMN IF NOT EXISTS strava_activity_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS runner_history_user_strava_activity_uidx
  ON runner_history (user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;
