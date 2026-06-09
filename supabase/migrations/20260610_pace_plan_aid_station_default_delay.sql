-- Race-level default dwell time (minutes) applied to aid stations that don't
-- have an explicit per-waypoint override (waypoints.delay). Surfaced in the
-- Pace Plan section so runners can tune time spent at aid stations.

ALTER TABLE race_pace_plans
    ADD COLUMN IF NOT EXISTS aid_station_default_delay integer NOT NULL DEFAULT 2;
