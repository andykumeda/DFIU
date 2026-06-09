-- Runner pacing profile is a per-runner attribute (strengths, pacing style,
-- weather/surface tolerances) that should follow the runner across every event,
-- so it lives on the user's profile rather than on a per-race pace plan.
-- The legacy race_pace_plans.runner_profile column is left in place but no
-- longer read or written by the app.

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS runner_profile jsonb;
