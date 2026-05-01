# Handoff Document

**Date:** 2026-04-30 (late evening session — closed)
**Status:** Stable / Production Deployed
**Last Deployed Commit:** `d78c351` (footer hash now uses `git describe --dirty`, so a `-dirty` suffix flags uncommitted-bundle drift).

> **2026-04-30 last-pass fixes (after the terrain rework):**
> - **DropBag modal top no longer clipped.** Two-step fix:
>   1. `5c8136f` — `90vh` → `90dvh` + outer `overflow-y-auto`. Helped, but `flex items-center` directly on the scroll container kept clipping when the modal grew taller than the viewport.
>   2. `f94d53f` — Switched to the standard nested-wrapper pattern: outer = `fixed inset-0 overflow-y-auto`; inner wrapper = `flex min-h-full items-center justify-center p-4`; modal = `max-h-[calc(100dvh-2rem)]`. Short content centers; tall content top-aligns and scrolls.
>   3. `d78c351` — Modal `z-50` → `z-[200]` so it overlays the page header (which is `z-[100]`).
> - **Page header trimmed** in `RaceDetail.tsx` — logo `h-24` → `h-14`, title `text-6xl` → `text-4xl`, `py-4` → `py-2`. Removes the empty whitespace under the wordmark.
> - **Build hash now uses `git describe --always --dirty --abbrev=7`** (`vite.config.ts`). Bundles built on a dirty working tree show `abc1234-dirty` in the footer. Deploy script unchanged.
>
> **2026-04-30 evening session shipped (terrain entry UX rework — still current):**
> - **Click-then-classify replaces brush flow.** Two map clicks define a segment; popup pops up at top-center of the map for terrain type selection (Save/Cancel). Profile drag still works — release fires the same popup.
> - **Out-and-back auto-paint.** After saving a segment, `findParallelMileRanges` (in `RaceDetail.tsx`) scans the route for coords within 25m of the picked range, groups them into mile ranges, and paints each with the same terrain. Handles out-and-backs, lollipop stems, and repeated loops.
> - **Adjacent paint snap.** Save tolerance widened from 0.01mi → 0.1mi (`SNAP_TOL` in `handleSaveTerrainSegment`). No more thin "default" sliver between back-to-back segments.
> - **Inline mile edit in sidebar.** Click a segment's mile range → number input with ✓/× (Enter saves, Esc cancels). Wired to `handleUpdateTerrainNodeMile` (recomputes lat/lon via `getCoordinateAtDistance`).
> - **Removed:** `T` map toggle button, brush selector chips in sidebar, drag-paint on map, embedded popup in CourseMap, `isTerrainMode` state in RaceDetail, `brushType`/`onPaintRange` plumbing in CourseMap and ElevationProfile.
>
> **Files touched (terrain rework):**
> - `src/features/course/CourseMap.tsx` — `onSegmentDefined` prop; click handler captures 2 points then fires; T button + popup gone.
> - `src/features/course/ElevationProfile.tsx` — `onRangeDefined` prop; brushType references stripped; drag preview uses static amber.
> - `src/features/course/TerrainSidebar.tsx` — brush chips removed; new `onUpdateNodeMile` prop drives inline mile editing.
> - `src/features/race/RaceDetail.tsx` — `pendingSegment` + `pendingType` state; `findParallelMileRanges`; `confirmPendingSegment` (paints primary + parallels); popup rendered as floating overlay above map.
>
> **Tunables (in case practice diverges from intent):**
> - `TOL_M = 25` in `findParallelMileRanges` — meters of proximity for "same physical pass." Bump up if parallel singletracks should merge; bump down if false positives.
> - `SNAP_TOL = 0.1` in `handleSaveTerrainSegment` — adjacent-paint snap window in miles.
> - `0.05` minimum range threshold in CourseMap click handler + ElevationProfile drag end — ignores micro-strokes.
>
> **2026-04-30 earlier in the day shipped (context):**
> - Terrain UX redesign phases 1–3 — hover tooltip, sidebar inline editor, drag-paint brush on elevation profile. Phase 3 brush flow has now been replaced by click-then-classify (this evening's rework).
> - Taxonomy and `defaultDifficulty` values frozen per design call (memory: `project_terrain_ux_scope.md`).
>
> **Open going into next session:**
> - **Terrain feature** — user is testing tomorrow. Last quote: "It seems to be working as expected." If parallel-pass detection misfires, tune `TOL_M`. If popup placement is awkward, it lives in `RaceDetail.tsx` inside the map column (search for `pendingSegment &&`).
> - **Drop bag modal** — confirmed resolved this session. No follow-up expected unless a new viewport edge case appears.
>
> **Workflow note for the remote-dev case:**
> The user develops remotely and only sees prod (no localhost access). Process:
> 1. **Commit before deploy.** If you build with uncommitted changes, the footer label lags reality — the bundle has the new code but the commit hash shown is the old one. With the new `--dirty` suffix this becomes visible (`abc1234-dirty`), but committing first is still cleaner.
> 2. **Hard refresh after deploy.** Browser caches `index.html` aggressively. Cmd+Shift+R or DevTools "Disable cache". The bundle filenames are content-hashed so the cache busts automatically once `index.html` is fresh.
> 3. There is **no service worker**, so the only cache layer to fight is the browser's own.
>
> **Next planned phases (still queued, untouched this session):**
> 1. Elevation **loss** verification — `docs/handoff/next-phase-descent-verification.md`. (User indicated current accuracy is acceptable; can defer.)
> 2. Roles & permissions (RBAC) — `docs/handoff/next-phase-roles-permissions.md`. 6 blocking design decisions, needs design checkpoint.
> 3. History-based pace calculation — `docs/handoff/next-phase-history-based-pacing.md`. 5 blocking decisions.
> 4. Crew mode directions — `docs/handoff/next-phase-crew-mode-directions.md`. Depends on RBAC.

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

*   **Production Deployment:** The app is deployed to `/var/www/dfiu` via `./scripts/deploy-remote.sh`. Deploys are **manual** — push alone does not deploy.
*   **Known Issues**:
    *   **Logo Navigation**: Clicking the logo/title may not reliably navigate to `/dashboard` despite `z-index` fixes.
    *   **Drop Bag Modal clip**: Fixed 2026-04-30 in `5c8136f`. Verify resolved; remove from list if so.

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

