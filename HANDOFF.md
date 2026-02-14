# Handoff Document

**Date:** 2026-02-12
**Status:** Stable / Production Deployed
**Last Deployed Commit:** 53fed4c

> [!IMPORTANT]
> **PROTOCOL INSTRUCTION:**
> 1. Going forward, **IMMEDIATELY** update this `HANDOFF.md` with the current tasks and status in case the connection breaks. Do this **BEFORE** starting any work.
> 2. **ALWAYS** deploy to production after **EACH** modification using `sudo ./scripts/deploy.sh`.


## Recent Changes

1.  **Aid Station Refinements (2026-02-13)**:
    *   Renamed "Waypoints" sidebar section to "Aid Stations".
    *   Sorted stations by mileage (ascending).
    *   Updated list items to show icons (Bag, Crew, Pacer) and removed cutoff times.
    *   Implemented map hover effect: hovering a sidebar item highlights the corresponding map marker.
    *   Fixed TypeScript build errors regarding property names (`crew_allowed`, `pacer_allowed`).
    *   Addressed permission issues with `dist` directory for smoother builds.
2.  **Map Fixes (2026-02-13):**
    *   **Marker Drift Fix**: Resolved issue where map markers drifted from their location when zooming out. Added explicit inline dimensions (`24px`), `anchor: 'center'`, and `offset: [0,0]` to all marker elements (`CourseMap.tsx`).
    *   **Verified**: Build passed and deployed to production.

3.  **Map Improvements:**
    *   Added **Map Controls** (Zoom, Bearing, Geolocate) to the top-right of the map.
    *   Moved **Map Style Switcher** to the **top-left** to prevent overlap.
    *   Added **Lat/Lon & Zoom Level** info overlay at the top.
    *   Added **Start/End Markers**: Automatically adds a Green Flag (Start) and Red Flag/Square (Finish) based on route geometry.

3.  **Elevation Stats & Accuracy:**
    *   **Lowest Point**: Replaced "Loss" statistic with "Lowest Point" (Min Elevation) in `RaceDetail.tsx`.
    *   **Fallback Calculation**: Implemented a fallback mechanism for "Gain", "Max Elevation", and "Min Elevation". If the database returns `0` or `null`, the app now calculates these values dynamically from the `elevation_samples` (GPX data) to ensure no zero values are shown.
    *   **Hover Sync**: Synchronized hovering between the Map and Elevation Profile.

4.  **UI/UX Updates:**
    *   **Logo & Branding**: Added custom logo (`public/logo.png`) to the application header. Resized to be significantly larger (`h-32` on Dashboard, `h-16` on Header).
    *   **Typography**: Updated "DFIU" title text to be more dynamic (Italic, Uppercase, Tracking-Tighter) with an **Orange-to-Red Gradient** to match the logo. Used `items-center` alignment with tight negative margins.
    *   **Navigation**: Fixed navigation issues by using `Link` components with `z-[999]` and explicit relative stacking to ensure clickability.
    *   **Race Overview**: Implemented a comprehensive **Overview Tab** as the default view for races. It integrates:
        *   **Event Details**: Date, Time, Interactive Location Link.
        *   **Rich Data**: Weather stats (High/Low/Precip/Moon), Course Records, Cutoffs, and Qualifiers.
        *   **Actions**: Direct links to Website and Registration.
        *   **Editing**: `EditRaceModal` updated to support all new data fields.
    *   **Bug Fixes**: Fixed `EditRaceModal` scrolling issue to ensure accessible form fields on smaller screens.

5.  **Geo-Utils & Waypoint Fixes (2026-02-11):**
    *   **Zero-Length Segment Guard**: Fixed `getNearestPointOnLine` in `geo-utils.ts` to handle duplicate/overlapping track points (zero-length segments) that caused division-by-zero and NaN coordinates, crashing Turf.js. This was specific to GPX files with very high point density (e.g., 55K+ points for a 250-mile course).
    *   **Direct Geometry Passing**: Updated `getCoordinateAtDistance` to accept `LineString`/`MultiLineString` geometry objects directly, plus implicit LineString objects without a `type` property.
    *   **Missing Elevation Warning**: Added a user-facing warning in `RaceDetail.tsx` when an uploaded GPX file lacks elevation (`<ele>`) tags.
    *   **Elevation Profile Empty State**: Improved the `ElevationProfile.tsx` empty state message to clearly indicate the GPX file is missing elevation data.
    *   **Waypoint Save Fix**: Fixed `cutoff_time` empty string issue causing database errors (coerced to `null`). Added `NaN` guard on `mile` field.
    *   **Race Resources Update**: Added `packet_pickup_datetime` and `briefing_datetime` fields. Updated `RaceResources` component to support date/time selection for these items.
    *   **Cleanup**: Removed unused dev dependencies (`autoprefixer`, `postcss`). Fixed lint errors/type safety issues in `geo-utils.ts` and `RaceResources.tsx`.

6.  **Mileage, Mobile Map & Terrain (2026-02-12):**
    *   **Mileage Precision**: Updated all mileage displays (Map, Detail, Pace Calculator) to use exactly **2 decimal places** (e.g., `12.50`).
    *   **Mobile Map Layout**: Fixed the full-screen map issue on mobile. The map now takes up 60% of the viewport height on mobile, allowing scrolling to see content below. FOLLOW-UP: Increased mobile map height to 50vh for better visibility.
    *   **Terrain Type**: Added `terrain_type` field to races (Default: Trail). Added input in Edit Modal and display in Race Overview.
    *   **Fixes**: Resolved issue where Edit Waypoint modal showed unformatted mileage. Mileage now defaults to 2 decimal places.

7.  **Header UI Refinements (2026-02-13):**
    *   **Spacing**: Decreased space between logo and title (`gap-2` -> `gap-0`).
    *   **Tagline**: Moved tagline slightly to the right (`-ml-1` -> `ml-0.5`).
    *   **NOTE**: Future refinement needed:
        *   Space between logo and title still needs to be decreased further.
        *   Tagline needs to move slightly more to the left to align exactly with the "D" in "DFIU".

8.  **Code Cleanup:**
    *   Removed unused variables in `utils.ts` and `CourseMap.tsx`.
    *   Fixed lint errors and type assertions in `CourseMap.tsx`.
    *   Removed debug console.log statements from `RaceDetail.tsx` and `geo-utils.ts`.

## Current State

*   **Production Deployment:** The app is deployed to `/var/www/dfiu` via `sudo ./scripts/deploy.sh`.
*   **Known Issues**:
    *   **Logo Navigation**: Clicking the logo/title may not reliably navigate to `/dashboard` despite `z-index` fixes. This is a known issue to be revisited.

## Next Steps

1.  **Pace Planning:** The "Pace Plan" tab is currently a placeholder. This is the next major feature to implement (Epic 2).
2.  **Documents:** The "Documents" tab is also a placeholder (Epic 3).
3.  **User Auth:** Authentication is basic; may need more robust role management if multiple users are added.

## Key Files

*   `src/features/course/CourseMap.tsx`: Main map component with Mapbox logic.
*   `src/features/race/RaceDetail.tsx`: Main page for race details, stats, and layout.
*   `src/lib/geo-utils.ts`: Geometry and distance calculation utilities.
*   `src/lib/gpx-parser.ts`: GPX parsing and elevation data processing.
*   `src/features/course/ElevationProfile.tsx`: SVG-based elevation profile chart.
    *   **Note:** The height of the profile container is set to `h-40` (160px) in `RaceDetail.tsx` and `NewRacePage.tsx`. This was chosen as a balance between visibility and compactness. Internal logic also "flattens" the curve by adding top padding. This may need further adjustment based on user feedback.

## Scripts

*   `npm run dev`: Local development.
*   `sudo ./scripts/deploy.sh`: Deploys to production server.

