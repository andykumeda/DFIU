-- Terrain-aware hybrid pace prediction. Runner history is private to its owner;
-- a race plan stores only a reproducible, non-sensitive input/result snapshot.

ALTER TABLE terrain_nodes
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE race_pace_plans
  ADD COLUMN IF NOT EXISTS pace_model_snapshot jsonb;

CREATE TABLE IF NOT EXISTS runner_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  race_name text NOT NULL,
  raced_at date,
  distance_mi numeric NOT NULL CHECK (distance_mi > 0),
  elevation_gain_ft integer CHECK (elevation_gain_ft >= 0),
  finish_minutes numeric NOT NULL CHECK (finish_minutes > 0),
  moving_minutes numeric CHECK (moving_minutes > 0),
  terrain_difficulty integer CHECK (terrain_difficulty BETWEEN 85 AND 175),
  altitude_ft integer CHECK (altitude_ft >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_history_user_date_idx ON runner_history (user_id, raced_at DESC NULLS LAST);
ALTER TABLE runner_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runner_history_owner" ON runner_history;
CREATE POLICY "runner_history_owner" ON runner_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
