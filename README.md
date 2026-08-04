# Don't F* It Up (DFIU)

> **AI agents:** before making any change in this repo, read **[`AGENTS.md`](AGENTS.md)**
> — specifically the **"Mandatory Agent Workflow"** (branch, commit, and document
> rules). It applies to every agent (Cursor, Codex, Claude, etc.) and exists to
> prevent lost-work confusion.

**Race planning for 100-mile+ trail runners who obsess over the details.**

DFIU helps you centralize your course, pace plan, logistics, and crew info in one place. It provides insights to ensure you don't "F* It Up" on race day.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — using courses, terrain, pace plans, training, crew, resources, and sharing.
- [Algorithm Reference](docs/ALGORITHMS.md) — pace, prediction, terrain pairing, overlap, and Strava-analysis methods and limits.
- [Developer Guide](docs/DEVELOPER_GUIDE.md) — architecture, data model, implementation rules, and release checklist.
- [Deployment Guide](DEPLOYMENT.md) — production release process.
- [Agent/developer handoff](HANDOFF.md) — current production state and active operational work.

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
-   **Terrain Segments:** Colored five-level terrain overlays, map/profile range selection, sidebar editing, selection highlighting, and reviewed reverse-direction out-and-back pairing.
-   **Pace Plans:** Automatically recalculated Plan A/B/C goal-time plans with grade, terrain, time-of-day, weather, runner-profile, and aid-station-delay factors; optional independent P10/P50/P90 prediction from a baseline and history.
-   **Training & Strava:** GPX import or snapped manual route creation, persistent course-overlap detection, persistent multi-activity Strava analysis, and moving-time comparisons for each individual overlapping section.
-   **Resources:** Reorderable links and Markdown text resources with icon choices and optional print-ready rendering.
-   **Crew View:** Mobile-first `/race/:id/crew` view with predicted runner location, next crew aid station, Google Maps destination links, drop bag details, and runner arrival check-ins.
-   **Live Event:** Live tab with optional livestream + Race Result embeds, runner location map, and followed-runner ETAs.
-   **Roles & Invites:** Race owners/runners can manage crew/pacer memberships, grant view/edit permissions, add existing users, save no-email pending access for new users, optionally send invite emails, and create private read-only share links for exact-link access.
-   **Weather Integration:** Race-location weather via the `weather` Supabase Edge Function (Visual Crossing key stays server-side).
-   **Settings:** User preferences, runner profile, and Strava OAuth.

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
The optional P10/P50/P90 predictor is separate and never replaces Plan A/B/C. See the
[Algorithm Reference](docs/ALGORITHMS.md) for exact behavior, assumptions, and limits.

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
    Copy `.env.example` to `.env` / `.env.local` and fill in:
    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_MAPBOX_TOKEN=your_mapbox_token
    ```

    Strava and Visual Crossing secrets are **not** client env vars. Set them as Supabase Edge Function secrets (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `VISUAL_CROSSING_KEY`). Never commit `.env`.

4.  Start the development server:
    ```bash
    npm run dev
    ```

## Scripts

-   `npm run dev`: Start the development server.
-   `npm run build`: TypeScript check + Vite production build.
-   `npm run deploy`: Build and deploy to `/var/www/dfiu`.
-   `npm run lint`: Run ESLint.
-   `npm test`: Run Vitest unit tests.
-   `npm run preview`: Preview the production build locally.

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md). Short version:

```bash
npm run deploy
```

Also apply reviewed Supabase migrations and deploy changed Edge Functions (`strava-auth`, `strava-activity`, `weather`, `invite-race-member`) when they change. See the migration safeguard in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Directory Structure

-   `src/features/auth/` - Authentication, session/profile loading, RBAC permission hook.
-   `src/features/course/` - Course map, elevation profile, map style switcher.
-   `src/features/race/` - Race detail, overview, resources, waypoint editing, terrain workflow, pace plans/prediction, training/Strava analysis, members, crew view, live tab, and check-ins.
-   `src/features/settings/` - User settings and integrations.
-   `src/pages/` - Application route pages (Dashboard, Login, Race Detail, etc.).
-   `src/lib/` - Shared utilities (Supabase client, geo-utils, GPX parser, weather client, race-select).
-   `supabase/functions/` - Edge Functions (`strava-auth`, `strava-activity`, `weather`, `invite-race-member`).
-   `src/components/ui/` - Shared UI components.

## Current Open Work

See [`HANDOFF.md`](HANDOFF.md) / [`AGENTS.md`](AGENTS.md). Highlights:

-   Second-account RBAC/invite verification.
-   Admin panel and owner-transfer UI.
-   Offline/PWA support for Crew View (if prioritized).
-   Finish or retire Pacer View placeholder.

## Developer Notes

- `terrain_nodes` are ordered mile boundaries; a type applies until the next boundary. On repeated course geometry, always resolve a point with its intended mile hint.
- Terrain writes and training overlap recomputation are data-sensitive. Add a focused regression test when changing a shared helper.
- The hosted Supabase migration history has diverged from this checkout. Do not run a blind `supabase db push`; use the documented scoped migration procedure in `HANDOFF.md` and verify the production schema.
- Run `npm test`, `npm run lint`, and `npm run build` for application changes. The repository workflow also requires a deployment after a successful build and a push of `main`.
