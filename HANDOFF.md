# Handoff Document

**Date:** 2026-08-19
**Branch:** `main`
**Status:** Training overlap data now groups brief same-direction GPS fragments into one analytical section, while preserving raw unique-mile totals and keeping real revisits/reversals separate. Imported GPX waypoints render as labeled markers on training detail maps.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend deployed from `2c792e9`; the remote production bundle was checked for that exact build hash after deployment.
- Training route `2a8fa4b3-636c-4b49-8b24-f56f78b5c1c0` now shows one course-overlap row and one Training Analysis section: race mi `11.3–42.6`, training mi `0.0–31.3`.
- Reference route `06a3df4b-95fb-47b5-b410-526654db6c9e` visibly shows Start, Finish, and both Water waypoints from its imported GPX.
- Waypoint GPX is fetched only for the selected route, so route-list loading does not download every large source file.
- Training route `394b45d7-d2ca-451f-97c7-62bdf6451373` now derives statistics from the raw accepted map sections, including the route's opening overlap section.
- Frontend: Pace Plan C shows race cutoff hours plus safety buffer.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Added a full production-geometry regression for the seven-fragment/one-continuous-section failure, plus focused continuity, GPX parsing, data projection, and waypoint-feature tests.
- Production browser verification confirmed the single overlap section, four reference-route waypoint markers, and a clean console.
- Validation: 98 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes.

## Previously finished

- Fixed overlap totals that included rejected nearby candidate hits. The reported Strawberry Peak route now calculates `8.54 mi`; its completed Strava activity independently calculates `10.99 mi` from the full-resolution traces.
- Added a compact real-geometry regression covering the race course, proposed training route, and completed Strava activity.
- Training map hover shows `Race: Mile XX.X | Training: Mile YY.Y` along the route.

## Previously finished

- Preserved raw accepted map sections for statistics while retaining merged ranges only for visual display.
- Confirmed Plan A goal edits recompute the pace plan and all derived Training/Strava comparisons; persisted activity data is intentionally unchanged.
- Fixed the remaining mismatch where the map showed three accepted sections but the summary retained only two continuity-assigned sections.
- Route loading now recomputes overlap sections from current route/course geometry, so existing persisted rows cannot keep stale statistics after algorithm changes.
- Performance fix: route loading uses the grid-based map matcher (~57 ms on the reported route) instead of the full continuity matcher (~2.6 s per route).
- The Pace Plan editor and Training section currently have separate `usePacePlans` instances; the editor's local Plan A change can wait for realtime propagation before Training recalculates.
- Added a same-page custom event so separate hook instances receive Plan A edits immediately; Supabase realtime remains the cross-tab/user path.

## Open

- Last product deployment: overlap grouping + imported GPX waypoint markers (`2c792e9`).
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
