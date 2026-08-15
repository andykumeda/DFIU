# Handoff Document

**Date:** 2026-08-14
**Branch:** `main`
**Status:** Show Plan C race cutoff hours next to the safety buffer.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: Pace Plan C shows race cutoff hours plus safety buffer.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Pace Plan C shows the race overall cutoff in hours (HH:MM) next to the safety buffer, plus the resulting Plan C finish (cutoff minus buffer).

## Open

- Last product deployment: Plan C cutoff hours (`93e76e9`); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?demo=1`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
