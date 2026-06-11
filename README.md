# Don't F* It Up (DFIU)

> **AI agents:** before making any change in this repo, read **[`AGENTS.md`](AGENTS.md)**
> — specifically the **"Mandatory Agent Workflow"** (branch, commit, and document
> rules). It applies to every agent (Cursor, Codex, Claude, etc.) and exists to
> prevent lost-work confusion.

**Race planning for 100-mile+ trail runners who obsess over the details.**

DFIU helps you centralize your course, pace plan, logistics, and crew info in one place. It provides insights to ensure you don't "F* It Up" on race day.

## Tech Stack

-   **Frontend:** React 19 + Vite 6
-   **Routing:** React Router v7
-   **State Management:** TanStack Query v5
-   **Styling:** Tailwind CSS v4
-   **Backend / Auth:** Supabase
-   **Maps:** Mapbox GL JS v3
-   **Geo Analysis:** Turf.js for route snapping, distance calculations, and nearest-point resolution
-   **Data Visualization:** Interactive Elevation Profiles (SVG-based)

## Features

-   **Course Mapping:** Upload GPX files to visualize routes on an interactive Mapbox map with outdoors, streets, and satellite views.
-   **Elevation Profile:** Interactive SVG elevation chart synchronized with the map (hover on one highlights the other).
-   **Waypoints / Aid Stations:** Add, edit, and drag-drop aid stations, water sources, crew points, pacer points, drop bag locations, and medical stations. Supports co-located waypoints at different miles for out-and-back courses (each visit retains its own attributes).
-   **Draggable Markers:** Drag waypoints on the map to reposition them. Markers snap to the route and compute the correct mileage, including for stacked waypoints on out-and-back courses using mile-hint segment resolution.
-   **Route Stats:** Total distance, elevation gain, lowest point, and max elevation — automatically calculated from GPX data with fallback computation.
-   **Race Overview:** Event details, weather forecasts, course records, cutoffs, qualifiers, and direct links to registration.
-   **Mile Markers:** Toggle mile markers along the route (auto-scaled by distance).
-   **Terrain Segments:** Visualize terrain types (paved, dirt, single track, technical) as colored overlays on the route. Supports map two-click range selection, elevation-profile drag selection, sidebar editing, and out-and-back auto-painting.
-   **Pace Plans:** Plan A/B/C pacing with terrain, grade, time-of-day, weather, and aid-station-delay factors. Pace plan inputs are stored in Supabase and sync realtime between race members.
-   **Crew View:** Mobile-first `/race/:id/crew` view with predicted runner location, next crew aid station, Google Maps destination links, drop bag details, and runner arrival check-ins.
-   **Roles & Invites:** Race owners can manage crew/pacer memberships, grant view/edit permissions, add existing users, save no-email pending access for new users, optionally send invite emails, and create private read-only share links for exact-link access.
-   **Weather Integration:** Fetch weather data for race locations.
-   **Settings:** User preferences, runner profile, and Strava integration.

## How Pace Is Calculated

The pace plan is **target-time driven**: you pick a goal finish time (Plan A/B/C) and
the model finds the steady baseline pace that, after all the adjustments below, lands
you at that finish time. It then distributes that pace across the course so each split
reflects the real difficulty of that section.

For every short segment of the course, the predicted pace is:

```
segment pace = base pace × grade × terrain × conditions × runner profile
```

- **Grade (% incline):** Uses a Minetti energy-cost curve — climbs cost more, gentle
  descents help, steep descents stop being "free." Derived from the GPX elevation.
- **Terrain:** Each segment's type carries a difficulty multiplier (paved ≈ 1.00 up to
  technical ≈ 1.30) that slows every runner on rougher ground.
- **Conditions (time-of-day & weather):**
  - *Fatigue* ramps up across the race (up to ~+25% by the finish).
  - *Altitude* adds a penalty above ~5,000 ft.
  - *Night* is detected from race-local sunrise/sunset and slows pace more on technical
    terrain.
  - *Heat* applies during midday hours scaled to the forecast high; *cold* applies at
    night scaled to the forecast low.
- **Runner profile (per-runner, in Settings):** Your strengths/weaknesses (climbing,
  descending, flats, technical, night, heat, cold, altitude, surfaces, and overall
  pacing style) nudge each segment — strong gives time back, weak costs more. The
  combined profile effect is capped so it can't dominate the physics.
- **Aid-station time:** Each support stop (aid station, water-only stop, crew/pacer,
  drop bag, or medical point) adds a stop duration (default 2 minutes) to your elapsed
  time.

Because it solves backward from your goal time, the chart answers *"what pace plan gets
me to my goal on this course?"* rather than predicting a finish time from your ability.

## Getting Started

### Prerequisites

-   Node.js (v18+)
-   NPM

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository_url>
    cd DFIU
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure environment variables:
    Create a `.env` or `.env.local` file with the following keys:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_MAPBOX_TOKEN=your_mapbox_token
    VITE_VISUAL_CROSSING_KEY=your_visual_crossing_key
    ```

    Security note: `VITE_VISUAL_CROSSING_KEY` is currently bundled client-side. Moving weather calls behind a Supabase Edge Function is the top open security task.

4.  Start the development server:
    ```bash
    npm run dev
    ```

## Scripts

-   `npm run dev`: Start the development server.
-   `npm run build`: TypeScript check + Vite production build.
-   `npm run deploy`: Build and deploy to `/var/www/dfiu`.
-   `npm run lint`: Run ESLint.
-   `npm run preview`: Preview the production build locally.

## Deployment

The application is deployed as a static site served by Nginx.

To deploy:
```bash
npm run deploy
```
This script builds the app and copies the `dist/` folder to `/var/www/dfiu`. No restart needed — Nginx picks up changes immediately.

## Directory Structure

-   `src/features/auth/` - Authentication, session/profile loading, RBAC permission hook.
-   `src/features/course/` - Course map, elevation profile, map style switcher.
-   `src/features/race/` - Race detail, overview, resources, waypoint editing, pace plans, members, crew view, check-ins.
-   `src/features/settings/` - User settings and integrations.
-   `src/pages/` - Application route pages (Dashboard, Login, Race Detail, etc.).
-   `src/lib/` - Shared utilities (Supabase client, geo-utils, GPX parser, weather service).
-   `src/components/ui/` - Shared UI components.

## Current Open Work

-   Second-account RBAC/invite verification.
-   Supabase Edge Function proxy for Visual Crossing weather.
-   Admin panel and owner-transfer UI.
-   Offline/PWA support for Crew View.
