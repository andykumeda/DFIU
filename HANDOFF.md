# Handoff Document

**Date:** 2026-08-14
**Branch:** `main`
**Status:** Relabeling P10/P50/P90 as an estimated finish and faster/slower range.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: Settings race history (Strava + GPX) and Pace ability card.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Settings → Race history: tagged Strava races and **Import GPX** (distance, gain, first-to-last timestamps; enter HH:MM if the file has no times).
- Relabeled the ability card to estimated finish and a faster–slower range, with on-card copy that these are not result percentiles.

## Open

- Last product deployment: ability-prediction docs + Pace card link (`24724e3`); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?demo=1`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
