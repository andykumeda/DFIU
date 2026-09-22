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

Official changes are opt-in for clones. `buildOfficialUpdateSections` compares the clone's current values with the latest source and exposes seven sections: `event`, `resources`, `drop_bag_template`, `course`, `waypoints`, `terrain`, and `training_routes`. Comparison normalizes blank strings and nulls as empty so `''` vs `null` never appears as a diff. Each difference is a structured change with stable id, full Current/Official display text, and an apply target. Event and Resources support field-level apply (race columns and `resources_config` ops via `partitionOfficialUpdateSelection` / `applyResourcesConfigOps`); course, waypoints, terrain, training routes, and drop-bag template still sync as whole sections through `sync_selected_official_updates`. The RPC validates clone edit access, applies only requested section identifiers, and advances `merged_official_revision` so declined changes are not repeatedly offered for the same source revision. A later source revision produces a fresh comparison against the clone's then-current state.

Waypoint synchronization owns official station structure and access fields. It must preserve runner-owned `drop_bag_items`, `drop_bag_name`, `drop_bag_notes`, and `delay` on existing linked waypoints. Training routes use `official_source_training_route_id`; official inserts and route-content updates bump the source revision. Route sync owns the official name, notes, path/GPX, elevation, course overlap, and ordering fields while preserving `strava_activity_inputs`, `strava_activity_results`, and personal-only routes. Pace plans, check-ins, support mode, members, and the clone title remain outside every official-update section. Keep the diff field lists aligned with the columns each section writes so the review never applies an undisclosed field.

- `strava-auth` — OAuth start/callback; gateway JWT verification is disabled because a user may not have a DFIU session yet. OAuth state provides CSRF protection.
- `strava-activity` — authenticated activity lookup, connection status, and tagged-race listing.
- `weather` — authenticated weather fetch using the server-side Visual Crossing key.
  - Overview and `WeatherLocations` display saved daily values. Current storage discards provider source and fetch timestamp, so UI labels must not infer whether a stored value is a current forecast or historical estimate. The Overview's no-login National Weather Service link is a public point-forecast reference, not provenance for the saved Visual Crossing response; `WeatherLocations` intentionally omits per-location external links. The existing function selects the UTC date of `start_datetime`, so race-local dates that differ from UTC need a separate service correction.
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

`DropBagCoverage` renders course-ordered coverage consistently on cards, in the editor, and on the individual sheet. `DropBagsSection` combines aid and bag destinations by waypoint ID (not name or mileage). Onward rows omit cutoffs; current-station card cutoffs are red. On-screen arrival values and durations are green, while the printable sheet stays black. Card notes are hidden without changing saved data. `DropBagPrintPage` portals a print preview to the body, using current editor state without a database write. Its scoped print rules hide all other body children, independently of the existing all-bags list. `formatBagCutoff` supports legacy local clocks and timestamp cutoffs in the race timezone.

### Race notes

`races.notes_config` stores an ordered `sections` array. Each section is a user-named `todo` checklist or Markdown `note` collection and includes per-item visibility. `notes-shared.ts` also migrates the legacy fixed `{ todos, notes }` JSON shape at read time, then filters items by membership role; editors (`canEditRaceSettings`) always see everything. `RaceNotes` is the Notes tab between Drop Bags and Resources and supports adding, renaming, reordering, and deleting sections without a schema migration. Clone copies `notes_config`; official sync/merge must not overwrite it, and notes are not an official-update review area. Column SELECT is granted like other race planning fields after the share-token column revoke.

### Drop-bag templates

Template items carry stable IDs. `mergeTemplateIntoItems` uses those IDs to propagate template additions, removals, and renames while preserving checked state, quantity, and explicitly customized per-bag entries. Legacy positional `tpl_N` items are migrated during reconciliation. The template editor's destructive replace action first saves the template, then sets only `waypoints.drop_bag_items` to `null` for all Start, Finish, official, and crew-bag candidates so each editor reseeds from the template; it must not clear `drop_bag_name` or `drop_bag_notes`. Supabase update calls select returned IDs so an RLS-filtered partial reset cannot be reported as success.

### Brand asset

`src/assets/dfiu-logo.png` is the transparent angular mountain/white DFIU/orange DON'T F* IT UP! lockup adapted from the supplied artwork. Headers and the shared footer display the full image without an adjacent duplicate wordmark. `public/favicon.png` is the compact square browser icon; `og-default.png` is the landscape sharing image and `og-ig.png` is the square Facebook/Instagram variant. Both `index.html` and `server/og-server.mjs` use matching image dimensions and the new revision. Vite fingerprints the imported header/footer logo URL to prevent stale browser artwork. `public/logo.png` remains a compatibility copy for already-open older app versions. Favicon and social image URLs carry an asset revision query; bump it when replacing those public assets. The source screenshot remains outside the repository.

### Bag lighting coverage

`drop-bag-lighting.ts` evaluates absolute Plan A arrival instants over each bag-to-next-visible-bag leg, extended by `LIGHTING_DELAY_MINUTES` (60). SunCalc's sunset threshold (-0.833 degrees) replaces civil dusk for gear recommendations; both endpoint coordinates are checked, including intervening sunsets for multi-day legs. The arrival sun/moon icon remains an arrival-state indicator. Calculations never use browser-local clock hours for gear planning. Missing inputs yield an explicit unavailable message. Terrain shade, weather and delays beyond the allowance are not modeled. `DropBagsSection` feeds the recommendation into editor suggestions, All Bags and the individual printable sheet; cards omit the lighting message. Checked smart-condition items survive recommendation changes. `DropBagTemplateEditor` portals to `document.body` so transformed/stacked race-tab ancestors cannot clip it.

### Terrain vocabulary

`terrain-constants.ts` owns the three trail categories and legacy normalization. The consolidation migration updates only `terrain_nodes.type` and asserts a hash of all other fields is unchanged. Existing database constraints continue accepting legacy values for old clients. Sidebar grouping and boundary compaction must compare difficulty as well as normalized type; unchanged-category bound edits retain saved difficulty. Public weather links use `weather-links.ts` to URL-encode the saved location query without credentials.
