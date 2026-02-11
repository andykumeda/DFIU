# Handoff Document

**Date:** 2026-02-10
**Status:** Stable / Production Deployed
**Last Deployed Commit:** (Check `git log`)

## Recent Changes

1.  **Map Improvements:**
    *   Added **Map Controls** (Zoom, Bearing, Geolocate) to the top-right of the map.
    *   Moved **Map Style Switcher** to the **top-left** to prevent overlap.
    *   Added **Lat/Lon & Zoom Level** info overlay at the top.
    *   Added **Start/End Markers**: Automatically adds a Green Flag (Start) and Red Flag/Square (Finish) based on route geometry.

2.  **Elevation Stats & Accuracy:**
    *   **Lowest Point**: Replaced "Loss" statistic with "Lowest Point" (Min Elevation) in `RaceDetail.tsx`.
    *   **Fallback Calculation**: Implemented a fallback mechanism for "Gain", "Max Elevation", and "Min Elevation". If the database returns `0` or `null`, the app now calculates these values dynamically from the `elevation_samples` (GPX data) to ensure no zero values are shown.
    *   **Hover Sync**: Synchronized hovering between the Map and Elevation Profile.

3.  **UI/UX Updates:**
    *   **Logo & Branding**: Added custom logo (`public/logo.png`) to the application header (Race Detail & Dashboard) and favicon.
    *   **Navigation**: Clicking the logo/title in the header now navigates to `/dashboard`.

4.  **Code Cleanup:**
    *   Removed unused variables in `utils.ts` and `CourseMap.tsx`.
    *   Fixed lint errors and type assertions in `CourseMap.tsx`.

## Current State

*   **Production Deployment:** The app is deployed to `/var/www/dfiu` via `npm run deploy`.
*   **Known Issues:** None at this time. All reported issues (zero stats, overlaps) should be resolved.

## Next Steps

1.  **Pace Planning:** The "Pace Plan" tab is currently a placeholder. This is the next major feature to implement (Epic 2).
2.  **Documents:** The "Documents" tab is also a placeholder (Epic 3).
3.  **User Auth:** Authentication is basic; may need more robust role management if multiple users are added.

## Key Files

*   `src/features/course/CourseMap.tsx`: Main map component with Mapbox logic.
*   `src/features/race/RaceDetail.tsx`: Main page for race details, stats, and layout.
*   `src/lib/geo-utils.ts`: Geometry and distance calculation utilities.
*   `src/lib/gpx-parser.ts`: GPX parsing and elevation data processing.

## Scripts

*   `npm run dev`: Local development.
*   `npm run deploy`: Deploys to production server.
