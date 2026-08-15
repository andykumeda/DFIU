# Handoff Document

**Date:** 2026-08-14
**Branch:** `main`
**Status:** Ability-prediction docs are linked from the Pace card.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: Settings race history (Strava + GPX) and Pace ability card.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Settings → Race history: tagged Strava races and **Import GPX** (distance, gain, first-to-last timestamps; enter HH:MM if the file has no times).
- Documented the ability-prediction walkthrough in `docs/ALGORITHMS.md` and linked it from the Pace card (`/documentation/algorithms#ability-based-prediction`).

## Open

- Last product deployment: ability-prediction docs + Pace card link (`24724e3`); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?demo=1`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
