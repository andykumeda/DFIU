# Crew Mode Status — Directions, ETAs, And Offline

**Status:** Crew View phases 1-3 are implemented. This file now tracks remaining crew-mode work rather than the original planned phase.

## Implemented

- Dedicated mobile route: `/race/:id/crew`.
- Mobile auto-redirect from full race detail to Crew View, with `?full=1` escape hatch.
- Desktop Crew tab embedded inside Race Detail.
- DB-backed `race_pace_plans` with realtime sync.
- DB-backed `runner_checkins` with realtime sync and upsert by `(race_id, waypoint_id)`.
- Pace-plan re-extrapolation from actual check-ins.
- Crew map showing course, waypoint pins, predicted runner marker, and crew location marker.
- Next crew aid-station card with straight-line distance, time until runner arrival, and Google Maps destination deep link.
- Drop bag panel for the next crew-accessible aid station.
- All-aid-stations list with predicted ETAs and check-in buttons for editors.

## Current Limitations

- Drive distance is haversine/straight-line, not road distance.
- Google Maps link opens destination routing but no in-app turn-by-turn route is computed.
- There is no traffic-aware travel time.
- Offline/PWA support is not implemented.
- `crew_allowed` is reused as the crew-accessibility flag; there is no separate parking/access notes field.

## Still Open

1. **Routing provider decision.** Keep deep links only, or add Google/Mapbox Directions API for road distance and duration.
2. **Parking/access metadata.** Decide whether to add `parking_notes` or a separate `crew_accessible` field instead of reusing `crew_allowed`.
3. **Runner-vs-crew timeline.** If routing durations are added, compare crew travel ETA against runner arrival ETA and flag misses.
4. **Offline/PWA phase.** Still open if prioritized: cache race/course/waypoint/terrain/pace/check-in/drop-bag data in IndexedDB, cache app shell, queue check-in writes, and replay on reconnect.
5. **Tile caching compliance.** Check Mapbox/offline tile terms before implementing downloadable map tiles. Consider MapTiler/Stadia if offline caching terms are better.

## Key Files

- `src/pages/CrewViewPage.tsx`
- `src/features/race/CrewView.tsx`
- `src/features/race/CrewMap.tsx`
- `src/features/race/usePacePlans.ts`
- `src/features/race/useRunnerCheckins.ts`
- `src/features/race/pace-utils.ts`
- `supabase/migrations/20260508_crew_phase1_pace_plans_checkins.sql`
