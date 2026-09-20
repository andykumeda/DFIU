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
