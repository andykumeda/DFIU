# Handoff Document

**Date:** 2026-08-04
**Branch:** `main` @ `723fad5`
**Status:** Persistent Training Analysis and Strava connection status deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `723fad5` (deployed; hard-refresh and compare the footer hash).
- Wilson Loop: **9.95 unique on-course miles**, displayed as **74.9–84.9**. Its start snaps to race mile **78.78**.
- Repository: `main` only; no extra worktrees or stale feature branches remain.

## Just finished

- Training Analysis now saves each route's entered Strava links/IDs and restores them after later visits and sessions. It continues to accept one run per line.
- The Training Analysis connection area now clearly shows “Connected as [Strava username]”; existing connections are backfilled from Strava when needed, while new/reconnected accounts save their display name immediately.
- Applied the scoped `training_routes.strava_activity_inputs` and `strava_connections.athlete_name` schema additions, verified both fields in production, deployed `strava-activity` v3 and `strava-auth` v16, and deployed frontend `723fad5`.
- Verified 31 tests, TypeScript production build, lint (0 errors; 31 existing warnings), and both Strava Edge Function checks.

- Training Analysis now sums every detected race overlap, weights each Strava activity's moving time to only its matching training miles, and accepts multiple activity links/IDs (one per line) with separate comparisons.
- Added regression coverage for multi-segment Plan A totals and moving-time overlap weighting; verified 31 tests, build, lint (0 errors; 31 existing warnings), and deployed frontend `53b665a`.

- Fixed the reproducible Map & Aid Stations → any-tab crash: CourseMap now clears its map reference before disposing Mapbox, and waypoint-label cleanup skips a disposed style. This prevents `getOwnLayer` from being read during React unmount cleanup.
- Verified build and 30 tests; deployed frontend `9708ce4`.

- Fixed a remaining Map & Aid Stations Mapbox lifecycle bug: terrain cleanup now checks layers and sources independently, preventing the unsafe `getOwnLayer` removal path after style changes.
- Custom Resource now begins with a Link/Text-box picker. Text boxes are full-width sections below links, can be ordered, have icon selection, and can opt into printing.
- Crew omits landmarks everywhere, treats Start and Finish as crew-accessible, visually labels them in green, and offers directions from the final crew aid station to Finish.
- Verified build, 30 tests, and lint (0 errors; 31 existing warnings); deployed frontend `b03754a`.

- Hardened the Training detail Mapbox layer lifecycle against a source/layer mismatch that can surface as `getOwnLayer` undefined; the SVG fallback remains available.
- Resources now support editable link or text entries, selectable icons, and titles that directly open link resources.
- Pace Plans now recalculate automatically from a valid edited goal time; the separate Generate Plan button is removed.
- Replaced landmark camera glyphs with mountains, limited Crew and Live crew maps to aid stations, and moved Strava Training Analysis into each selected training route.
- Overview weather samples now use a chosen aid station, show only high/low temperatures, and show all Plan A arrival times for repeated station visits.
- Verified build, 30 tests, and lint (0 errors; 31 existing warnings); deployed frontend `4b66013`.

- Removed stale generated/review artifacts, an obsolete one-off migration script, and superseded handoff notes.
- Reconciled and removed `codex/fix-vite-chunk-deploy`; retained its useful deploy safeguards on `main` (`c372a00`).
- Refreshed patched dependencies without the React Router breaking downgrade (`b64d8f6`). Two audit findings remain limited to React Router RSC mode, which this BrowserRouter SPA does not use.
- Fixed Training detail-map drawing by synchronizing custom layers directly with Mapbox style readiness and stabilizing map props/callbacks. SVG fallback remains available when WebGL cannot initialize.
- Fixed overlap recomputation so it always derives updates from current geometries and surfaces database read/write failures instead of silently leaving stale values.
- Backfilled the production Wilson Loop row from its current GPX and the current Angeles Crest 100 GPX.
- Verified 27 tests, TypeScript production build, lint (0 errors; 31 existing warnings), WebGL rendering, SVG fallback, repeated map mount/unmount, and production deployment.
- Added Mapbox terrain backgrounds behind overview-card routes, while keeping those card maps deliberately non-interactive.
- Added concise Plan A race segment miles, target time, and all training portions to every route card.
- Added a Training Analysis panel: connect Strava once, paste an activity link or ID, and compare actual elapsed time with the selected route's Plan A segment goal and delta.
- Stored Strava activity tokens only in a server-only, user-scoped connection table; deployed the updated `strava-auth` and new `strava-activity` Edge Functions.
- Verified 29 tests, TypeScript production build, lint (0 errors; 31 existing warnings), production deployment, and live Training UI with no browser-console warnings/errors.
- Fixed the Strava callback session failure. Training Analysis now binds a Strava authorization to the currently signed-in participant's DFIU account and keeps it separate from the event owner; activity lookup only ever uses that participant's token.
- Replaced the fragile temporary-password handoff, deployed both Strava functions, and added a regression test so Edge Function responses show their real error message. Verified 30 tests, both Deno Edge Function checks, lint (0 errors; 31 existing warnings), and production deployment.
- Removed the legacy Strava sign-in user-list lookup, which did not reliably filter by email. Sign-in now resolves only through the unique Strava athlete-to-DFIU-user mapping; a Strava account already attached to another user is rejected rather than reassigned.
- With explicit approval, added a server-side transfer for an OAuth-proven athlete connection. It replaces only the current participant's prior connection and moves the athlete mapping without involving the event owner.

## Open / follow-up

- **Priority follow-up:** the failed legacy callback updated one real DFIU account before it failed, so that account's prior password may have been replaced. Do not reset or delete it without confirming the account owner; use the normal password-recovery flow with that person if needed.
- Rotate the previously tracked Strava client secret and confirm Supabase function secrets.
- Reconcile Supabase migration history before the next `db push`: the new `strava_connections` schema was applied directly because the remote history already contains migrations absent locally. The tracked migration is `20260804012144_strava_activity_connections.sql`; do not run migration repair blindly.
- Apply the share-token migration and deploy the `weather` Edge Function.
- Verify RBAC and invite flows end-to-end with a second account.
- Build `/admin` and owner-transfer UI.
- Finish or retire Pacer View; decide whether offline/PWA Crew View remains a priority.
- Revisit Training pace copy (duration plus `(pace/mi)` only) if still desired.
- Consider additional code splitting for the existing large-chunk build warnings.

## Workflow reminders

- Run `npm test` / `npm run build`, then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
