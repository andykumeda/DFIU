# DFIU Developer Guide

## Architecture at a glance

DFIU is a React 19/Vite single-page app backed by Supabase. The race detail screen composes the major product areas: overview, map/aid stations, pace plans, training, crew, resources, live, drop bags, and members.

| Area | Primary location | Notes |
| --- | --- | --- |
| Auth and permissions | `src/features/auth/` | Auth context plus race-level permission hook. |
| Course geometry | `src/features/course/` | GPX parsing, Mapbox map, terrain rendering, elevation profile. |
| Race product features | `src/features/race/` | Pace, terrain, training, crew, resources, membership, live state. |
| Shared calculations | `src/lib/` | Geographic utilities, GPX parsing, training overlap, weather client. |
| Database and server code | `supabase/migrations/`, `supabase/functions/` | Schema/RLS and OAuth/weather/invite/activity functions. |

## Core data relationships

- A **race** owns one or more courses and shared presentation/configuration data.
- A **course** owns GPX geometry, elevation samples, waypoints, and terrain nodes.
- A **terrain node** is a boundary: its type/difficulty applies from `mile` until the next node.
- A **training route** belongs to a race and persists its geometry plus derived race-overlap segments and Strava-analysis inputs/results.
- **Race memberships** govern owner/crew/pacer role and view/edit access. Runner history is private to its owning user.
- An **official race** is a global source. `site_admins` is the sole mutation authority for official race, course, waypoint/drop-bag, terrain, pace, training, membership, live, check-in, and location data. Everyone else edits a personal clone.

## Important implementation rules

### Repeated course geometry

Out-and-backs and loops revisit the same coordinates. A location alone is ambiguous. When resolving a point on a course, pass the intended race-mile hint to `getNearestPointOnLine`; this is required for waypoint dragging and terrain rendering. `CourseMap` converts terrain boundaries with that hint so the visual endpoint stays on the correct course visit.

### Terrain writes

Terrain has two write paths: range painting and sidebar segment editing. Preserve the terrain active immediately after an edited range by inserting a restore boundary at the new end. Avoid broad endpoint tolerances when creating exact boundaries. The terrain pairing workflow uses geometry to propose reverse-direction counterparts, but users can decline the proposed range in the map dialog.

### Training analysis

Persisted overlap is derived data. Recompute it from current geometries after a course or training-route change; do not trust stale saved ranges. The load path uses `computeTrainingMapOverlap(..., { mergeAdjacent: false })` to preserve raw direction and avoid the heavier creation-time matcher. Both map and analysis disambiguate near-identical distant course visits with continuity. `buildTrainingPlanSummary` merges continuous fragments, selects unique directional passes, projects official aid/Start/Finish boundaries, and omits sections shorter than 0.25 miles. Compare Strava moving time over matched activity-distance intervals, not elapsed time. Saved activity GPS is transient: old compact mappings require **Analyze runs** again after geometry/matcher changes.

### Pace plans

Plan A/B/C are target-time distributions. Use `formatPlanALabel` from `plan-label.ts` with `computePlanMinutes(...).a` (or the passed `planAGoalMinutes`) for event-specific labels. Never use a section duration or check-in-adjusted projection as the displayed goal. The race-scoped `dfiu:pace-plans:${raceId}` event synchronizes independent hook instances immediately; Supabase realtime handles remote changes. Any change to factor math should update `docs/ALGORITHMS.md`, tests in `src/features/race/*.test.ts`, and any saved model version/snapshot behavior.

## Local development

1. Copy `.env.example` to `.env.local` and set Supabase and Mapbox client values.
2. Use Node.js 22 (the CI version), run `npm ci`, then `npm run dev`.
3. Run `npm test`, `npm run lint`, and `npm run build` before a feature commit.

Never expose Strava or Visual Crossing secrets in client variables. They belong in Supabase Edge Function secrets.

## Database and Edge Functions

The app uses Supabase RLS and RPCs for race access, membership, and selected protected operations. Schema changes are kept in `supabase/migrations/`; current Edge Functions are:

Official-source protection belongs in database helpers and policies, with UI gating only as a clarity layer. Any new write table or SECURITY DEFINER RPC that accepts a race ID must preserve the invariant that `races.is_official = true` is writable only by `user_is_site_admin()`. Do not use an email address in authorization logic; the canonical admin identity is the `site_admins` row. Personal clones retain owner/editor behavior.

Official changes are opt-in for clones. `buildOfficialUpdateSections` compares the clone's current values with the latest source and exposes seven independently selectable sections: `event`, `resources`, `drop_bag_template`, `course`, `waypoints`, `terrain`, and `training_routes`. It must describe every written field as a concrete current-to-official replacement or explicit add/remove action. `sync_selected_official_updates` validates clone edit access, accepts only those identifiers, applies only the requested areas, and then advances `merged_official_revision` so declined areas are not repeatedly offered for the same source revision. A later source revision produces a fresh comparison against the clone's then-current state.

Waypoint synchronization owns official station structure and access fields. It must preserve runner-owned `drop_bag_items`, `drop_bag_name`, `drop_bag_notes`, and `delay` on existing linked waypoints. Training routes use `official_source_training_route_id`; official inserts and route-content updates bump the source revision. Route sync owns the official name, notes, path/GPX, elevation, course overlap, and ordering fields while preserving `strava_activity_inputs`, `strava_activity_results`, and personal-only routes. Pace plans, check-ins, support mode, members, and the clone title remain outside every official-update section. Keep the diff field lists aligned with the columns each section writes so the review never applies an undisclosed field.

- `strava-auth` — OAuth start/callback; gateway JWT verification is disabled because a user may not have a DFIU session yet. OAuth state provides CSRF protection.
- `strava-activity` — authenticated activity lookup, connection status, and tagged-race listing.
- `weather` — authenticated weather fetch using the server-side Visual Crossing key.
- `invite-race-member` — authenticated, permission-checked invite workflow.
- `signup` — pre-session, access-code-gated email/password signup.
- `share-preview` — public link-preview response. The production Nginx path also uses `server/og-server.mjs`; see Deployment Guide.

The hosted migration history currently diverges from this checkout. Do not run a blind `supabase db push`. Apply a reviewed scoped migration to the linked project, verify the production schema/data affected, and record it in `HANDOFF.md`.

## Release checklist

1. Read `AGENTS.md`; work on `main` unless a user explicitly requests a branch.
2. Update `HANDOFF.md` before work begins.
3. Update affected user documentation and repository documentation in the same change. If no documentation needs to change, record that decision in `HANDOFF.md`.
4. Run tests, lint, and production build for code changes.
5. Commit a coherent conventional-commit batch.
6. Run `npm run deploy` after a successful production build.
7. Update `HANDOFF.md` with the deployed feature hash, verification, and remaining work.
8. Commit the handoff and push `origin/main`.

See [Deployment Guide](../DEPLOYMENT.md), [Algorithm Reference](ALGORITHMS.md), and [User Guide](USER_GUIDE.md).

### Drop-bag print sheets

`DropBagCoverage` renders the existing course-ordered coverage rows on cards and the individual sheet. `DropBagPrintPage` portals a print preview to the body, using current editor state without a database write. Its scoped print rules hide all other body children, independently of the existing all-bags list. `formatBagCutoff` supports legacy local clocks and timestamp cutoffs in the race timezone.
