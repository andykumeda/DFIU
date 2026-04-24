# Next Phase — Crew Mode: Inter-Aid-Station Directions & Travel Time

**Status:** Planned / design + integration.
**Prereq:** RBAC phase (crew role must exist to scope this feature). Existing aid stations / waypoints with lat/lon on race courses.

---

## Goal

Crew members need to drive between aid stations. Give them:

1. **Turn-by-turn directions** from one aid station to the next (Google Maps deep link or embedded directions).
2. **Estimated drive time** per leg, so they can plan arrival ahead of the runner.
3. **Total round-trip plan** across all aid stations they're covering.

## What the User Must Provide / Decide

1. **Routing provider:**
   - Google Maps (deep link — simplest, no API cost; embedded Directions API — richer, needs key + billing).
   - Mapbox Directions (already have Mapbox key for course map — consistent, one vendor).
   - Apple Maps deep link (iOS-first users).
2. **Experience:**
   - Deep link ("Open in Google Maps") per aid station pair — zero in-app routing.
   - In-app embedded directions + time estimate — more work, more control.
   - Or both: show in-app ETA, tap to open native app?
3. **Road-access assumption:** some aid stations are pack-in only (no car access). How to flag? Manual `crew_accessible` boolean on waypoints? Reuse existing `crew_allowed`?
4. **Traffic / time-of-day:** plan shows expected arrival — use live traffic (Google with API key) or static estimates?
5. **Runner ETA sync:** does crew leg time compare against runner pace plan to flag "you'll miss them"? Likely yes, but scope it.

## Data / Model Additions

Probably minimal schema:

```sql
-- on waypoints (if not already)
alter table waypoints add column if not exists crew_accessible boolean default true;
alter table waypoints add column if not exists parking_notes text;
```

Cached routing result (optional, avoid re-calling API):

```sql
create table crew_route_cache (
  from_waypoint_id uuid,
  to_waypoint_id uuid,
  distance_mi numeric,
  duration_sec integer,
  provider text,
  computed_at timestamptz,
  primary key (from_waypoint_id, to_waypoint_id, provider)
);
```

## Work Breakdown

1. **Design checkpoint** on 5 decisions.
2. **Routing adapter:** thin wrapper over chosen provider. Input = (lat,lon) pair; output = `{ distance, duration, polyline?, deepLinkUrl }`.
3. **Crew view:** new UI in race detail when user has `crew` role (gated via RBAC `usePermission`). List aid stations in order; each row shows "next leg: X mi, ~Y min drive". Tap → open native directions.
4. **Leg calculation:** precompute all consecutive pairs the crew covers (skip non-`crew_accessible` stations). Sum total drive time.
5. **Runner-ETA overlay:** pull runner's pace plan arrival time at each aid station, diff against crew arrival. Warn when crew ETA > runner ETA.
6. **Cache layer:** if using billable API, cache results per route. Invalidate on waypoint lat/lon change.
7. **Offline / no-signal fallback:** persist last-known directions so crew can reference mid-drive without signal. Deep link to offline-capable native app is safest.

## Success Criteria

- Crew member opens race page, sees list of aid stations with drive time to next.
- Tap "Directions" → native Google Maps / Apple Maps opens with destination prefilled.
- Total crew timeline visible alongside runner pace plan.
- Non-accessible aid stations excluded or clearly flagged.

## Reference

- Waypoints already carry lat/lon (see `CourseMap.tsx` marker rendering).
- `crew_allowed` flag exists on waypoints (per HANDOFF.md §3 "Aid Station Refinements"). Verify before adding a new column.
- Mapbox key already in `.env`.

## Relationship to Other Phases

**Depends on RBAC phase** (needs `crew` role to gate the view). Independent of elevation-loss and history-pacing phases. Pairs naturally with history-pacing (crew sees "runner's ETA based on their history" not just raw model).
