# Handoff Document

**Date:** 2026-04-21
**Status:** Stable / Production Deployed
**Last Deployed Commit:** d3b1d44

> Latest session notes: see `docs/handoff/2026-04-21-session-handoff.md`.
> Elevation **gain** now within ~2% of Strava on all three tested GPX sources.
>
> **Next planned phases:**
> 1. Elevation **loss** ground-truth verification — `docs/handoff/next-phase-descent-verification.md`. Awaiting user-supplied Strava descent numbers for Bay Area 100 and Leona Divide 50 (Cocodona loss: 33,884 ft).
> 2. Roles & permissions (RBAC) — `docs/handoff/next-phase-roles-permissions.md`. Site admin + event owner + crew + pacer, view/edit per grant. Greenfield — requires design checkpoint with user before code (6 blocking decisions documented).
> 3. History-based pace calculation — `docs/handoff/next-phase-history-based-pacing.md`. Use runner's past Strava / UltraSignup results (exact race or similar) to seed pace predictions. 5 blocking design decisions.
> 4. Crew mode: inter-aid-station directions + drive-time ETA — `docs/handoff/next-phase-crew-mode-directions.md`. Google Maps / Mapbox / Apple Maps routing per leg. **Depends on RBAC phase** for crew role gating.
> 5. Terrain entry UX redesign — `docs/handoff/next-phase-terrain-ux.md`. Replace per-segment modal with elevation-profile / list painting. 5 design decisions. Small prep refactor landed 2026-04-23 (`terrain-constants.ts` dedup) — user should review.
>
> **Parallelizable:** phases 1, 2, 3, 5 are independent. Phase 4 depends on 2.
> **Quick bug to fix early:** drop-bag modal top is clipped — see Known Issues below.

> [!IMPORTANT]
> **PROTOCOL INSTRUCTION:**
> 1. Going forward, **IMMEDIATELY** update this `HANDOFF.md` with the current tasks and status in case the connection breaks. Do this **BEFORE** starting any work.
> 2. **ALWAYS** deploy to production after **EACH** modification using `./scripts/deploy-remote.sh`.
> 3. **NEVER** use GPG signing for git commits.


## Recent Changes

1.  **Pace Plan Enhancements (2026-03-05):**
    *   **Goal Modes:** Added Plan A (Goal), Plan B (Midpoint auto-calculated), and Plan C (Cutoff with safety buffer).
    *   **Dynamic Pacing Matrix:** Pace calculations now utilize a bisection solver and factor in Course Terrain, Average Gradient, Time of Day (Nighttime penalty), and Temperature (Heat/Cold penalties).
    *   **Metrics:** Real-time display of Required Pace/Speed, Segment Pace, and Overall Pace accurately formatted to user Profile distance units (miles/km).
    *   **UI Polish:** Added mobile scroll indicators for the splits table and contextual Sun/Moon icons for daytime/nighttime arrival estimates.

2.  **Waypoint Drag/Drop Fix (2026-02-13):**
    *   **Root Cause**: The `waypoints` prop passed to `CourseMap` was created inline with `.map()` every render, producing a new array reference. The marker-creation `useEffect` depended on this prop, so it tore down and rebuilt all Mapbox markers on every render — destroying Mapbox's internal drag state between `mousedown` and `mousemove`, preventing drags from ever initiating.
    *   **Fix**: Memoized the waypoints prop via `useMemo` in `RaceDetail.tsx` keyed on the React Query result, so markers only rebuild when data actually changes.
    *   **Additional fixes in the same changeset:**
        *   Removed `highlightedWaypointId` from the marker-creation `useEffect` dependency array. Sidebar hover no longer triggers a full marker teardown/rebuild; highlighting is handled by a separate lightweight `useEffect` that toggles CSS classes.
        *   Moved `pointer-events` logic for highlighted/non-highlighted markers into the highlight `useEffect`.
        *   Replaced `async` dynamic `import()` in the `dragend` handler with a static top-level import to eliminate a race condition between the `await` and marker teardown.
        *   Added `wasDragged` flag to suppress spurious `click` events that fire after a drag-end.
        *   Added optimistic cache update in `handleWaypointMove` (`queryClient.setQueryData`) to prevent markers snapping back to stale positions during query revalidation.
        *   Removed `pointer-events: none` from the inner marker `el` element — this was causing `mousedown` events to fall through to the Mapbox canvas instead of being captured by the marker container, which prevented Mapbox's `_addDragHandler` from recognizing the marker.

2.  **Stacked Waypoint Mileage Preservation (2026-02-13):**
    *   **Problem**: Co-located waypoints at different miles (e.g. Big Bear outbound at mile 30 and inbound at mile 70 on an out-and-back course) were both getting assigned the same absolute mile after a drag, destroying visit differentiation.
    *   **Fix**: Each waypoint in a stacked group is now resolved individually using `getNearestPointOnLine` with `mileHint` set to the waypoint's current mile. This finds the correct route segment (outbound vs inbound). All waypoints in the stack share the same snapped lat/lon so they remain co-located and continue to group together on the map. Each gets its own correct mile value from its resolved segment.

3.  **Aid Station Refinements (2026-02-13)**:
    *   Renamed "Waypoints" sidebar section to "Aid Stations".
    *   Sorted stations by mileage (ascending).
    *   Updated list items to show icons (Bag, Crew, Pacer) and removed cutoff times.
    *   Implemented map hover effect: hovering a sidebar item highlights the corresponding map marker.
    *   Fixed TypeScript build errors regarding property names (`crew_allowed`, `pacer_allowed`).

4.  **Map Fixes (2026-02-13):**
    *   **Marker Drift Fix**: Resolved issue where map markers drifted from their location when zooming out. Added explicit inline dimensions (`24px`), `anchor: 'center'`, and `offset: [0,0]` to all marker elements (`CourseMap.tsx`).

5.  **Map Improvements:**
    *   Added **Map Controls** (Zoom, Bearing, Geolocate) to the top-right of the map.
    *   Moved **Map Style Switcher** to the **top-left** to prevent overlap.
    *   Added **Lat/Lon & Zoom Level** info overlay at the top.
    *   Added **Start/End Markers**: Automatically adds a Green Flag (Start) and Red Flag/Square (Finish) based on route geometry.

6.  **Elevation Stats & Accuracy:**
    *   **Lowest Point**: Replaced "Loss" statistic with "Lowest Point" (Min Elevation) in `RaceDetail.tsx`.
    *   **Fallback Calculation**: Implemented a fallback mechanism for "Gain", "Max Elevation", and "Min Elevation". If the database returns `0` or `null`, the app now calculates these values dynamically from the `elevation_samples` (GPX data).
    *   **Hover Sync**: Synchronized hovering between the Map and Elevation Profile.

7.  **UI/UX Updates:**
    *   **Logo & Branding**: Custom logo (`public/logo.png`) with Orange-to-Red Gradient title.
    *   **Race Overview**: Comprehensive Overview Tab as default view with Event Details, Weather, Course Records, Cutoffs, Qualifiers, and direct links.
    *   **Header UI Refinements**: Adjusted spacing between logo and title, tagline alignment.

8.  **Geo-Utils & Waypoint Fixes (2026-02-11):**
    *   **Zero-Length Segment Guard**: Fixed `getNearestPointOnLine` to handle duplicate/overlapping track points.
    *   **Direct Geometry Passing**: Updated `getCoordinateAtDistance` to accept `LineString`/`MultiLineString` geometry objects directly.
    *   **Waypoint Save Fix**: Fixed `cutoff_time` empty string issue and `NaN` guard on `mile` field.
    *   **Race Resources Update**: Added `packet_pickup_datetime` and `briefing_datetime` fields.

9.  **Mileage, Mobile Map & Terrain (2026-02-12):**
    *   **Mileage Precision**: All mileage displays use exactly **2 decimal places**.
    *   **Mobile Map Layout**: Map takes 50vh on mobile with scroll for content below.
    *   **Terrain Type**: Added `terrain_type` field to races.
6.  **Terrain Canvas Model (2026-02-16):**
    *   **Paint Mode**: Added "Paint" toggle. Clicking the map adds a terrain segment (default 0.5mi) at that location.
    *   **Undefined vs Paved**:
        *   **Undefined (Gray)**: Base layer (using `other` type internally).
        *   **Paved (Blue)**: Explicit road segments.
    *   **Smart Gaps**: Editing the "0 - Start" gap in the sidebar is now possible and auto-fills the range. New segments "restore" to Undefined.
    *   **Sidebar Logic**: Fixed to show `Start -> End` ranges correctly.
    *   **TODO**: Further refinements to the terrain editing workflow are expected (per user: "changes need to be made tomorrow").

## Architecture Notes

### Waypoint Drag/Drop System
The drag/drop system for waypoints on the course map involves careful coordination between Mapbox GL JS markers and React state:

*   **Marker Lifecycle**: Mapbox markers are created in a `useEffect` in `CourseMap.tsx` that depends on `[waypoints, mapLoaded, coordinates, terrainNodes]`. Markers are torn down and rebuilt when these dependencies change. The `waypoints` prop MUST be memoized by the parent to prevent unnecessary rebuilds that destroy drag state.
*   **Drag Events**: Mapbox registers `mousedown`/`touchstart` handlers on the map (not the DOM element). It checks `element.contains(e.originalEvent.target)` to identify which marker was clicked. The inner marker `el` must NOT have `pointer-events: none` or clicks fall through to the canvas.
*   **Stacked Waypoints**: Waypoints within ~10m of each other (lat/lon difference < 0.0001) are grouped into a single marker. On drag, each waypoint resolves its new mile independently using `getNearestPointOnLine` with `mileHint` (the waypoint's current mile), but all share the same snapped lat/lon to maintain co-location.
*   **Highlighting**: Handled by a separate `useEffect` that toggles CSS classes and `pointer-events`, independent of marker creation.

### Key Implementation Details
*   `geo-utils.ts` `getNearestPointOnLine(pt, line, mileHint?)`: When `mileHint` is provided, searches all route segments within 0.5 miles and picks the one whose cumulative distance is closest to the hint. Critical for out-and-back courses where the same physical location maps to multiple miles.
*   `RaceDetail.tsx` `handleWaypointMove`: Uses optimistic cache update (`queryClient.setQueryData`) before the Supabase write, then `invalidateQueries` to revalidate.

## Current State

*   **Production Deployment:** The app is deployed to `/var/www/dfiu` via `./scripts/deploy-remote.sh`.
*   **Known Issues**:
    *   **Logo Navigation**: Clicking the logo/title may not reliably navigate to `/dashboard` despite `z-index` fixes.
    *   **Drop Bag Modal — top cut off**: Top of the Drop Bag modal is clipped; users cannot see the header/top content. Likely a viewport height / flex overflow issue in `src/features/race/DropBagModal.tsx`. Reproduce on standard desktop viewport and mobile. Should be fixed early in next session — small scope, high-visibility bug.

## Next Steps

1.  **Documents:** The "Documents" tab is also a placeholder.
2.  **User Auth:** Authentication is basic; may need more robust role management if multiple users are added.

## Key Files

*   `src/features/course/CourseMap.tsx`: Main map component with Mapbox logic, marker creation, drag/drop handling.
*   `src/features/course/CourseMap.module.css`: Map marker styles, highlighting, toolbar.
*   `src/features/race/RaceDetail.tsx`: Main page for race details, stats, layout, and waypoint move handler.
*   `src/lib/geo-utils.ts`: Geometry and distance calculation utilities (nearest point, mileHint resolution, distance from start).
*   `src/lib/gpx-parser.ts`: GPX parsing and elevation data processing.
*   `src/lib/weather-service.ts`: Weather data fetching for race locations.
*   `src/features/course/ElevationProfile.tsx`: SVG-based elevation profile chart.
*   `src/features/settings/SettingsPage.tsx`: User settings and Strava integration.

## Scripts

*   `npm run dev`: Local development server.
*   `npm run build`: TypeScript check + Vite production build.
*   `npm run deploy`: Build and deploy to `/var/www/dfiu`.
*   `npm run lint`: Run ESLint.

