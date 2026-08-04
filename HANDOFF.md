# Handoff Document

**Date:** 2026-08-03
**Branch:** `main` @ `977bea3`
**Status:** Training Analysis Strava connection repair is deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `977bea3` (deployed; hard-refresh and compare the footer hash).
- Wilson Loop: **9.95 unique on-course miles**, displayed as **74.9–84.9**. Its start snaps to race mile **78.78**.
- Repository: `main` only; no extra worktrees or stale feature branches remain.

## Just finished

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

## Open / follow-up

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
