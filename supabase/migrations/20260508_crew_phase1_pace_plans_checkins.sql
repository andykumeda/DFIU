-- Crew Phase 1 — DB-backed pace plans + manual runner check-ins.
--
-- Schema:
--   race_pace_plans   (race_id PK)            — owner's plan A/B/C, replaces localStorage
--   runner_checkins   (race_id, waypoint_id)  — actual arrivals, drives re-extrapolation
--
-- RLS keys off existing helpers user_can_view_race / user_can_edit_race / user_owns_race.

-- =========================================================================
-- 1. race_pace_plans
-- =========================================================================
CREATE TABLE IF NOT EXISTS race_pace_plans (
    race_id uuid PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
    plan_a_time text NOT NULL DEFAULT '24:00',     -- HH:MM
    plan_b_time text,                              -- HH:MM, null = auto midpoint
    plan_c_buffer text NOT NULL DEFAULT '00:30',   -- HH:MM
    has_calculated boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE race_pace_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "race_pace_plans_select" ON race_pace_plans;
DROP POLICY IF EXISTS "race_pace_plans_insert" ON race_pace_plans;
DROP POLICY IF EXISTS "race_pace_plans_update" ON race_pace_plans;
DROP POLICY IF EXISTS "race_pace_plans_delete" ON race_pace_plans;

CREATE POLICY "race_pace_plans_select" ON race_pace_plans
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "race_pace_plans_insert" ON race_pace_plans
    FOR INSERT WITH CHECK (user_can_edit_race(race_id));

CREATE POLICY "race_pace_plans_update" ON race_pace_plans
    FOR UPDATE USING (user_can_edit_race(race_id))
    WITH CHECK (user_can_edit_race(race_id));

CREATE POLICY "race_pace_plans_delete" ON race_pace_plans
    FOR DELETE USING (user_owns_race(race_id));

-- =========================================================================
-- 2. runner_checkins
-- =========================================================================
CREATE TABLE IF NOT EXISTS runner_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    waypoint_id uuid NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
    arrived_at timestamptz NOT NULL,
    entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (race_id, waypoint_id)
);

CREATE INDEX IF NOT EXISTS runner_checkins_race_id_idx ON runner_checkins(race_id);
CREATE INDEX IF NOT EXISTS runner_checkins_arrived_at_idx ON runner_checkins(race_id, arrived_at);

ALTER TABLE runner_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runner_checkins_select" ON runner_checkins;
DROP POLICY IF EXISTS "runner_checkins_insert" ON runner_checkins;
DROP POLICY IF EXISTS "runner_checkins_update" ON runner_checkins;
DROP POLICY IF EXISTS "runner_checkins_delete" ON runner_checkins;

CREATE POLICY "runner_checkins_select" ON runner_checkins
    FOR SELECT USING (user_can_view_race(race_id));

CREATE POLICY "runner_checkins_insert" ON runner_checkins
    FOR INSERT WITH CHECK (user_can_edit_race(race_id));

CREATE POLICY "runner_checkins_update" ON runner_checkins
    FOR UPDATE USING (user_can_edit_race(race_id))
    WITH CHECK (user_can_edit_race(race_id));

CREATE POLICY "runner_checkins_delete" ON runner_checkins
    FOR DELETE USING (user_can_edit_race(race_id));
