-- Runner-specific pacing tendencies used by the pace chart algorithm.

ALTER TABLE race_pace_plans
    ADD COLUMN IF NOT EXISTS runner_profile jsonb;
