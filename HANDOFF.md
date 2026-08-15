# Handoff Document

**Date:** 2026-08-14
**Branch:** `main`
**Status:** Race history supports Strava plus GPX import; shorter finishes are down-weighted vs the planned distance.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: Settings race history (Strava + GPX) and Pace ability card.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Settings → Race history: tagged Strava races and **Import GPX** (distance, gain, first-to-last timestamps; enter HH:MM if the file has no times).
- Ability prediction weights history by recency × `min(1, history miles / target miles)` (floor 0.15). A 50K/50-mile/100K still counts for a 100, but less than a similar-distance finish. Plan A unchanged unless **Use P50 as Plan A**.

## Open

- Last product deployment: pending this batch; production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?demo=1`.
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
