# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** In progress — collapse multi-visit aid labels on the map.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `fa6fc6b` (training preview legends off; compact detail legend). Hard-refresh and compare the footer hash.
- AC100 training overlaps backfilled in DB (all 6 routes).
- Repository: `main` @ `a13316c` on `origin/main`.

## In progress

- Map labels for colocated multi-visit aids (e.g. Shortcut Saddle 1/2) show the shared base name once; Drop Bags keep full visit names.

## Just finished

- Training preview cards no longer show the race/training/overlap legend; detail view keeps a smaller in-map legend (`fa6fc6b`). Also includes prior terrain-legend + hidden pace-calibration UI.

- CourseMap terrain legend moved to **bottom-left** and shrunk (tighter padding/type for mobile). Pace “Prediction calibration” panel gated behind `SHOW_PREDICTION_CALIBRATION = false` (logic/state kept). Verified 46 tests, build, lint 0 errors (`96d295e`).

- Training route detail UI (`f95361a`): color legend moved into the map; race course line violet (`#9333ea`) vs blue training / orange overlap; Plan A overlap line shows time of day with duration in parentheses via `formatHM` (no min/mi pace). Verified 46 tests, production build.

- Fixed training-route / race-course overlap for out-and-backs and start/finish colocation (`0de0c5b`):
  - **Shortcut to Newcomb:** disconnected race visits → `42.7→33.2` and `72.4→63.0` (~18.9 mi); different times of day.
  - **Shortcut to Hillyer:** continuous race out-and-back → one span `42.6→63.4` (~20.7 mi); no gap.
  - **Chantry to Finish:** finish continuity fixed (`82.3–100.8`); gap `80.1–82.3` is a real Wilson-area shortcut (~0.37 mi off course), not a false negative.
  - Wilson Loop unchanged. Docs: `docs/ALGORITHMS.md`. Verified 46 tests, lint 0 errors, production build. DB backfilled.

- Fixed production race-list `42501`: applied `GRANT SELECT (official_revision, merged_official_revision) ON public.races TO anon, authenticated` on DFIU; merged PR #5 (`getErrorMessage`, `NewRacePage` `.select(RACE_SELECT)`, tracked migration `20260805130000_grant_official_merge_columns.sql`). Anon probe `select=id,official_revision,merged_official_revision` returns 200. Closed superseded drafts #3/#4 and deleted their remote branches. Verified 44 tests, production build, lint (0 errors); deployed frontend `45c01bc`.

## Open / follow-up

- **Priority follow-up:** the failed legacy callback updated one real DFIU account before it failed, so that account's prior password may have been replaced. Do not reset or delete it without confirming the account owner; use the normal password-recovery flow with that person if needed.
- Rotate the previously tracked Strava client secret and confirm Supabase function secrets.
- Reconcile Supabase migration history before the next `db push`: the new `strava_connections` schema was applied directly because the remote history already contains migrations absent locally. The tracked migration is `20260804012144_strava_activity_connections.sql`; do not run migration repair blindly.
- Apply the share-token migration and deploy the `weather` Edge Function.
- Verify RBAC and invite flows end-to-end with a second account.
- Build `/admin` and owner-transfer UI.
- Finish or retire Pacer View; decide whether offline/PWA Crew View remains a priority.
- Preview-card Plan A copy is unchanged; only the detailed training overlap Plan A line dropped pace/mi.
- Consider additional code splitting for the existing large-chunk build warnings.

## Workflow reminders

- Run `npm test` / `npm run build`, then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
