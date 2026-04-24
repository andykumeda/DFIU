# Next Phase — History-Based Pace Calculation

**Status:** Planned / design + data pipeline.
**Prereq:** Existing pacing system (Plan A/B/C, bisection solver, terrain + gradient + time-of-day + temperature factors — see HANDOFF.md §1 "Pace Plan Enhancements").

---

## Goal

Use runner's past race history to inform pace predictions for the current race. Two modes:

1. **Same race, prior year(s)** — if user has run this exact race before, weight that performance heavily.
2. **Similar race** — if no prior run of this race, find comparable races by characteristic (distance, gain/loss, terrain mix, climate) from user history.

Output feeds the existing bisection solver as a prior / seed, or adjusts the pace matrix directly.

## What the User Must Provide / Decide

1. **Data source** — where does history come from?
   - Strava activities (already OAuth'd per `StravaCallback.tsx`).
   - UltraSignup results scraped by runner name.
   - Manual entry (last-mile fallback).
   - Combination?
2. **Identity matching** — how to link a Strava activity to a specific DFIU race record? Name fuzzy match + date window? User confirms link?
3. **Similarity metric** — what fields define "similar"?
   - Distance (± how many mi?)
   - Elevation gain/loss (± %)
   - Terrain mix (paved / dirt / technical)
   - Climate (avg temp, altitude)
   - Weight/priority order?
4. **How to blend** — prior-run data vs. course-model prediction:
   - Bayesian prior with confidence shrinkage?
   - Simple weighted average?
   - User-selectable ("trust my history more" slider)?
5. **Staleness** — does a 5-year-old result count as much as last year's? Decay function?

## Data Model Sketch

```sql
create table runner_history (
  id uuid primary key,
  user_id uuid references auth.users(id),
  source text check (source in ('strava','ultrasignup','manual')),
  external_id text,
  race_name text,
  race_date date,
  distance_mi numeric,
  elevation_gain_ft integer,
  elevation_loss_ft integer,
  finish_time_sec integer,
  avg_pace_sec_per_mi numeric,
  terrain_profile jsonb,
  linked_race_id uuid references races(id) null,  -- user-confirmed match
  created_at timestamptz default now()
);

create index on runner_history(user_id, race_date desc);
```

## Work Breakdown

1. **Design checkpoint** on 5 blocking questions above.
2. **Ingest:** Strava activity pull → normalize → store in `runner_history`. Run on Strava link + periodic refresh.
3. **Matcher:** "did this runner run this race before?" — name + date proximity. UI confirmation to link.
4. **Similarity search:** given current race characteristics, rank history rows by similarity. Top N feed the pace engine.
5. **Pace engine integration:** extend bisection solver to accept prior estimate + confidence. Determine how to fold in without destabilizing the terrain/temp/night factors already working.
6. **UI:** show "based on your 2024 Bay Area 100 (24h 30m)" as visible rationale on pace plan page. Let user toggle "ignore history" if they want pure model.
7. **Tests:** synthetic runner with known history; verify prediction converges toward historical pace when same race, blends when similar.

## Success Criteria

- Runner who has completed Race X last year sees a pace plan seeded by that result, not pure model.
- Runner with no exact match but two similar-profile finishes sees a blended estimate with UI showing which races informed it.
- Runner with no history falls back cleanly to current model (no regression).

## Reference

- Current pace engine location: referenced in HANDOFF.md §1; trace from race-detail pace-plan component.
- Strava OAuth: `src/features/auth/StravaCallback.tsx`, settings in `src/features/settings/SettingsPage.tsx`.

## Relationship to Other Phases

Independent of descent-verification and RBAC phases. Pairs naturally with RBAC: owner/crew might have different read access to a runner's history.
