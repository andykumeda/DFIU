# Handoff Document

**Date:** 2026-08-16
**Branch:** `main`
**Status:** Training overlap statistics now use every raw accepted map section (without display merging); route loading avoids the expensive full matcher. Plan A changes recompute derived training comparisons. Validated and deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Training route `394b45d7-d2ca-451f-97c7-62bdf6451373` now derives statistics from the raw accepted map sections, including the route's opening overlap section.
- Frontend: Pace Plan C shows race cutoff hours plus safety buffer.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Fixed overlap totals that included rejected nearby candidate hits. The reported Strawberry Peak route now calculates `8.54 mi`; its completed Strava activity independently calculates `10.99 mi` from the full-resolution traces.
- Added a compact real-geometry regression covering the race course, proposed training route, and completed Strava activity.
- Training map hover shows `Race: Mile XX.X | Training: Mile YY.Y` along the route.

## Just finished

- Preserved raw accepted map sections for statistics while retaining merged ranges only for visual display.
- Confirmed Plan A goal edits recompute the pace plan and all derived Training/Strava comparisons; persisted activity data is intentionally unchanged.
- Fixed the remaining mismatch where the map showed three accepted sections but the summary retained only two continuity-assigned sections.
- Route loading now recomputes overlap sections from current route/course geometry, so existing persisted rows cannot keep stale statistics after algorithm changes.
- Performance fix: route loading uses the grid-based map matcher (~57 ms on the reported route) instead of the full continuity matcher (~2.6 s per route).

## Open

- Last product deployment: fast raw-section route loading (`7b0cf96`); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?training=394b45d7-d2ca-451f-97c7-62bdf6451373`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
