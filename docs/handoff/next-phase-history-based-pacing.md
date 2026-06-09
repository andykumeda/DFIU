# Next Phase - History-Based Pacing

**Status:** Planned. No implementation has started.

## Distributor vs. Predictor (architecture decision to revisit)

The current pace engine is a **target-time distributor**: you give it a goal finish
time (Plan A/B/C) and it solves (via bisection) for the steady baseline pace that, after
grade/terrain/fatigue/night/heat/cold/altitude/runner-profile/aid-station factors, hits
that goal — then distributes the time across the course so each split reflects real
section difficulty. It answers *"what pace plan gets me to my goal on this course?"*

A **finish-time predictor** would instead answer *"given this runner, what finish time
results?"* That is a meaningfully bigger lift, and the gating cost is **data, not math**:

- It needs a calibrated ability anchor the app doesn't store today — e.g. a flat-ground
  threshold/baseline pace, or a known recent result — plus, ideally, per-runner
  coefficients (climbing, heat, altitude) learned from past data.
- Without that anchor, a predictor just compounds guesses into a confident-looking
  number that can be hours off on a 100-miler — worse UX than an honest goal-based plan.

**Recommendation (revisit in this phase):**
1. Keep the distributor as the core model.
2. Get predictive value *cheaply* first by leaning on the existing check-in
   re-extrapolation (`applyActualCheckins` in `pace-utils.ts`): once a runner logs a few
   real splits, the remaining plan re-anchors to observed pace — a grounded "live
   predicted finish" with no new ability model.
3. Only build a true pre-race predictor once `runner_history` (below) exists to supply
   the baseline. Lowest-risk path: add a single "baseline flat pace" input, treat the
   current factor stack as the multiplier, and **validate against 2–3 known finishes**
   before trusting it.

Effort: moderate code, high data/validation cost. Defer the standalone predictor; invest
first in tuning the current factor magnitudes and in check-in-based live prediction.

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
