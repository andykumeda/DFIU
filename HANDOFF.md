# Handoff Document

**Date:** 2026-08-03
**Branch:** `main` @ `4a737c0`
**Status:** Training detail map and Wilson Loop overlap are fixed, deployed, and production data is corrected.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `4a737c0` (deployed; hard-refresh and compare the footer hash).
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

## Active task

- None.

## Open / follow-up

- Rotate the previously tracked Strava client secret and confirm Supabase function secrets.
- Apply the share-token migration and deploy the `weather` / updated `strava-auth` Edge Functions.
- Verify RBAC and invite flows end-to-end with a second account.
- Build `/admin` and owner-transfer UI.
- Finish or retire Pacer View; decide whether offline/PWA Crew View remains a priority.
- Revisit Training pace copy (duration plus `(pace/mi)` only) if still desired.
- Consider additional code splitting for the existing large-chunk build warnings.

## Workflow reminders

- Run `npm test` / `npm run build`, then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
