# Handoff Document

**Date:** 2026-08-16
**Branch:** `main`
**Status:** Training overlap totals count accepted race-course segments only; validated and deployed to production.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Training route `394b45d7-d2ca-451f-97c7-62bdf6451373` shows `8.5 mi on course, +1,422 ft (mi 10.5–11.3, mi 16.9–24.6)` with a clean browser console.
- Frontend: Pace Plan C shows race cutoff hours plus safety buffer.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Fixed overlap totals that included rejected nearby candidate hits. The reported Strawberry Peak route now calculates `8.54 mi`; its completed Strava activity independently calculates `10.99 mi` from the full-resolution traces.
- Added a compact real-geometry regression covering the race course, proposed training route, and completed Strava activity.
- Training map hover shows `Race: Mile XX.X | Training: Mile YY.Y` along the route.

## Open

- Last product deployment: accepted-segment Training overlap totals (`03ed7af`); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?training=394b45d7-d2ca-451f-97c7-62bdf6451373`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
