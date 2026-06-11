-- Race-day Live tab metadata and followed-runner ETA tracking.
--
-- Main runner identity is separate from races.resources_config so official
-- resource syncs do not overwrite a user's runner name/bib in cloned events.
-- Followed runners use the same race execution permission helper as runner
-- check-ins: managers, runners, crew, and pacers can update; viewers can read.

CREATE TABLE IF NOT EXISTS race_live_configs (
    race_id uuid PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
    runner_name text,
    bib_number text,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS race_live_followed_runners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    bib_number text,
    predicted_finish_minutes integer NOT NULL CHECK (predicted_finish_minutes > 0 AND predicted_finish_minutes <= 10080),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS race_live_followed_runners_race_idx
    ON race_live_followed_runners(race_id, created_at);

CREATE TABLE IF NOT EXISTS race_live_followed_runner_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    followed_runner_id uuid NOT NULL REFERENCES race_live_followed_runners(id) ON DELETE CASCADE,
    waypoint_id uuid NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
    arrived_at timestamptz NOT NULL,
    entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (followed_runner_id, waypoint_id)
);

CREATE INDEX IF NOT EXISTS race_live_followed_runner_checkins_race_idx
    ON race_live_followed_runner_checkins(race_id, arrived_at);
CREATE INDEX IF NOT EXISTS race_live_followed_runner_checkins_runner_idx
    ON race_live_followed_runner_checkins(followed_runner_id, arrived_at);

CREATE OR REPLACE FUNCTION public.set_race_live_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_race_live_configs_updated_at ON race_live_configs;
CREATE TRIGGER trg_race_live_configs_updated_at
BEFORE UPDATE ON race_live_configs
FOR EACH ROW EXECUTE FUNCTION public.set_race_live_updated_at();

DROP TRIGGER IF EXISTS trg_race_live_followed_runners_updated_at ON race_live_followed_runners;
CREATE TRIGGER trg_race_live_followed_runners_updated_at
BEFORE UPDATE ON race_live_followed_runners
FOR EACH ROW EXECUTE FUNCTION public.set_race_live_updated_at();

ALTER TABLE race_live_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_live_followed_runners ENABLE ROW LEVEL SECURITY;
ALTER TABLE race_live_followed_runner_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "race_live_configs_select" ON race_live_configs;
DROP POLICY IF EXISTS "race_live_configs_insert" ON race_live_configs;
DROP POLICY IF EXISTS "race_live_configs_update" ON race_live_configs;
DROP POLICY IF EXISTS "race_live_configs_delete" ON race_live_configs;

CREATE POLICY "race_live_configs_select" ON race_live_configs
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "race_live_configs_insert" ON race_live_configs
    FOR INSERT WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "race_live_configs_update" ON race_live_configs
    FOR UPDATE USING (user_can_manage_team(race_id))
    WITH CHECK (user_can_manage_team(race_id));

CREATE POLICY "race_live_configs_delete" ON race_live_configs
    FOR DELETE USING (user_can_manage_team(race_id));

DROP POLICY IF EXISTS "race_live_followed_runners_select" ON race_live_followed_runners;
DROP POLICY IF EXISTS "race_live_followed_runners_insert" ON race_live_followed_runners;
DROP POLICY IF EXISTS "race_live_followed_runners_update" ON race_live_followed_runners;
DROP POLICY IF EXISTS "race_live_followed_runners_delete" ON race_live_followed_runners;

CREATE POLICY "race_live_followed_runners_select" ON race_live_followed_runners
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "race_live_followed_runners_insert" ON race_live_followed_runners
    FOR INSERT WITH CHECK (user_can_log_race_execution(race_id));

CREATE POLICY "race_live_followed_runners_update" ON race_live_followed_runners
    FOR UPDATE USING (user_can_log_race_execution(race_id))
    WITH CHECK (user_can_log_race_execution(race_id));

CREATE POLICY "race_live_followed_runners_delete" ON race_live_followed_runners
    FOR DELETE USING (user_can_log_race_execution(race_id));

DROP POLICY IF EXISTS "race_live_followed_runner_checkins_select" ON race_live_followed_runner_checkins;
DROP POLICY IF EXISTS "race_live_followed_runner_checkins_insert" ON race_live_followed_runner_checkins;
DROP POLICY IF EXISTS "race_live_followed_runner_checkins_update" ON race_live_followed_runner_checkins;
DROP POLICY IF EXISTS "race_live_followed_runner_checkins_delete" ON race_live_followed_runner_checkins;

CREATE POLICY "race_live_followed_runner_checkins_select" ON race_live_followed_runner_checkins
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "race_live_followed_runner_checkins_insert" ON race_live_followed_runner_checkins
    FOR INSERT WITH CHECK (
        user_can_log_race_execution(race_id)
        AND EXISTS (
            SELECT 1
            FROM race_live_followed_runners r
            WHERE r.id = followed_runner_id
              AND r.race_id = race_live_followed_runner_checkins.race_id
        )
        AND EXISTS (
            SELECT 1
            FROM waypoints w
            JOIN courses c ON c.id = w.course_id
            WHERE w.id = waypoint_id
              AND c.race_id = race_live_followed_runner_checkins.race_id
        )
    );

CREATE POLICY "race_live_followed_runner_checkins_update" ON race_live_followed_runner_checkins
    FOR UPDATE USING (user_can_log_race_execution(race_id))
    WITH CHECK (
        user_can_log_race_execution(race_id)
        AND EXISTS (
            SELECT 1
            FROM race_live_followed_runners r
            WHERE r.id = followed_runner_id
              AND r.race_id = race_live_followed_runner_checkins.race_id
        )
        AND EXISTS (
            SELECT 1
            FROM waypoints w
            JOIN courses c ON c.id = w.course_id
            WHERE w.id = waypoint_id
              AND c.race_id = race_live_followed_runner_checkins.race_id
        )
    );

CREATE POLICY "race_live_followed_runner_checkins_delete" ON race_live_followed_runner_checkins
    FOR DELETE USING (user_can_log_race_execution(race_id));
