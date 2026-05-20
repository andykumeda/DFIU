# Next Phase - History-Based Pacing

**Status:** Planned. No implementation has started.

## Goal

Use a runner's prior race results to seed or adjust the existing pace-plan model. Current pacing is based on course distance, terrain, grade, night, temperature, weather, and aid-station delays. This phase would add personal history as another input.

## Open Decisions

1. **History source:** Strava activities, manual entry, UltraSignup import, or a combination.
2. **Race matching:** how users confirm that a past activity/result corresponds to a DFIU race.
3. **Similarity model:** which factors matter most for "similar race" matching: distance, gain/loss, terrain mix, altitude, heat, or date recency.
4. **Blending behavior:** whether history acts as a solver seed, a weighted adjustment, or a user-controlled confidence slider.
5. **Privacy:** whether crew/pacer members can see the runner's historical results or only the derived pace plan.

## Likely Data Model

```sql
create table runner_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null check (source in ('strava', 'manual', 'import')),
  external_id text,
  race_name text not null,
  race_date date,
  distance_mi numeric,
  elevation_gain_ft integer,
  elevation_loss_ft integer,
  finish_time_sec integer,
  terrain_profile jsonb,
  linked_race_id uuid references races(id) on delete set null,
  created_at timestamptz default now() not null
);
```

## Implementation Sketch

1. Add `runner_history` storage and RLS scoped to the owning user.
2. Add manual history entry first; add Strava import later if needed.
3. Add a history matcher that suggests exact and similar races.
4. Extend `calculatePacePlan` with an optional history prior while preserving the current no-history behavior.
5. Show which history rows influenced the plan and allow users to disable history weighting.

## Success Criteria

- A runner with a prior finish for the same race sees a pace plan influenced by that result.
- A runner with similar races sees a transparent blended estimate.
- A runner with no history gets the same output as today's model.
