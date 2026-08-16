# Handoff Document

**Date:** 2026-08-15
**Branch:** `main`
**Status:** Highlight clicked training overlap sections on the course map.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: Pace Plan C shows race cutoff hours plus safety buffer.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Training route detail: clicking a course-overlap section or a Strava analysis section highlights that stretch on the map (yellow) and zooms to it. Click again to clear.

## Open

- Last product deployment: training section map highlight (`9711485`); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?demo=1`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
