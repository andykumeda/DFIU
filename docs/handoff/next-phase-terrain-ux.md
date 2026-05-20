# Terrain Entry UX Status

**Status:** Implemented and field-tested enough to remain current. This file supersedes the older planned redesign doc.

## Implemented

- Shared terrain taxonomy, colors, and default difficulty in `src/features/course/terrain-constants.ts`.
- Map two-click segment selection: first click sets start, second click defines end, then Race Detail opens the terrain classification popup.
- Elevation-profile drag selection feeds the same pending segment/classification flow.
- Out-and-back/lollipop auto-paint via `findParallelMileRanges` in `RaceDetail.tsx`.
- Adjacent paint snapping via `SNAP_TOL = 0.1` miles in `handleSaveTerrainSegment`.
- Terrain sidebar supports inline mile editing and manual range add.
- Terrain type drives pace calculation through existing `terrain_nodes` data.
- Terrain visibility is intentionally gated by `canEdit`, not `canView`; view-only members do not see terrain overlays.

## Current Tunables

- `TOL_M = 25` in `RaceDetail.tsx`: spatial tolerance for matching parallel physical passes.
- `SNAP_TOL = 0.1` in `RaceDetail.tsx`: mile tolerance for merging adjacent terrain segment boundaries.
- `0.05` mile minimum segment length in map/profile selection: ignores accidental micro-segments.

## Still Open

- Tune `TOL_M` if field testing finds false positive/negative parallel-pass auto-painting.
- Consider exposing an advanced difficulty override UX if users need custom difficulty beyond type defaults.
- Revisit visibility if product wants view-only members to see terrain but not edit it.

## Key Files

- `src/features/course/terrain-constants.ts`
- `src/features/course/CourseMap.tsx`
- `src/features/course/ElevationProfile.tsx`
- `src/features/course/TerrainSidebar.tsx`
- `src/features/race/RaceDetail.tsx`
- `src/features/race/pace-utils.ts`
