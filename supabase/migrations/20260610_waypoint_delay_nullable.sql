-- waypoints.delay was `integer DEFAULT 0`, so every waypoint had delay = 0.
-- That made `delay` indistinguishable from a real per-station override (0 != null),
-- so the aid-station Stop column / pace algorithm never fell back to the runner's
-- profile default. Make "unset" mean NULL: drop the default and convert the
-- existing 0 placeholders to NULL so they pick up the per-user default. A
-- deliberate 0-minute stop is now stored as an explicit 0 override.

ALTER TABLE waypoints ALTER COLUMN delay DROP DEFAULT;

UPDATE waypoints SET delay = NULL WHERE delay = 0;
