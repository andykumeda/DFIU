# Next Phase - History-Based Pacing

**Status:** Implemented as a transparent, optional hybrid predictor. This note now records the remaining calibration work.

## Distributor vs. Predictor (architecture decision to revisit)

The current pace engine is a **target-time distributor**: you give it a goal finish
time (Plan A/B/C) and it solves (via bisection) for the steady baseline pace that, after
grade/terrain/fatigue/night/heat/cold/altitude/runner-profile/aid-station factors, hits
that goal — then distributes the time across the course so each split reflects real
section difficulty. It answers *"what pace plan gets me to my goal on this course?"*

A **finish-time predictor** now answers *"given this runner, what finish time range does
the current model estimate?"* It remains separate from the target-time distributor. The
gating cost is still **data, not math**:

- It needs a calibrated ability anchor — a flat-ground baseline pace and/or known recent
  result — plus, ideally, per-runner coefficients (climbing, heat, altitude) learned
  from enough past data.
- Without that anchor, a predictor just compounds guesses into a confident-looking
  number that can be hours off on a 100-miler — worse UX than an honest goal-based plan.

**Implemented approach:**
1. The target-time distributor remains the core Plan A/B/C engine.
2. A manual flat baseline plus optional runner history produces a separate P10/P50/P90
   estimate (`pace-prediction.ts`). History is distance/elevation adjusted, recency
   weighted, and blended with bounded influence.
3. Course simulation applies grade, terrain, night, heat, altitude, technical downhill,
   runner-profile, and stop-time factors. Check-ins still re-anchor the live plan.

See `docs/ALGORITHMS.md` for the user-facing explanation and limitations.

## Remaining calibration work

Validate the predictor against known finishes before increasing its influence or presenting
its bands as more than transparent planning scenarios.

## Open Decisions

1. **History source:** manual entry is available; decide whether to add a reviewed Strava/import path.
2. **Validation set:** collect known finishes across varied course profiles.
3. **Similarity model:** decide whether terrain mix, altitude, and weather should receive explicit history weighting.
4. **Privacy:** retain user-scoped history; decide whether to expose only derived predictions to crew/pacers.

## Current data model

```sql
create table runner_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  race_name text not null,
  raced_at date,
  distance_mi numeric not null,
  elevation_gain_ft integer,
  finish_minutes numeric not null,
  moving_minutes numeric,
  terrain_difficulty integer,
  altitude_ft integer,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
```

History is RLS-scoped to its owning user. `race_pace_plans.pace_model_snapshot` stores a
non-sensitive input/result snapshot so a plan remains explainable after its source inputs
change.

## Follow-up implementation options

1. Add a reviewed Strava/import path only if it can preserve user control and history privacy.
2. Add a history matcher that suggests exact and similar races.
3. Surface the contributing history entries and allow users to exclude an entry from a prediction.

## Success Criteria

- A runner with a prior finish can see a transparent independent prediction influenced by that result.
- A runner with no history receives a wide, explicitly low-confidence prediction rather than a silently precise estimate.
- The target-time Plan A/B/C distributor remains unchanged by history unless the user changes its target.
