# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Mobile map scroll cue below elevation deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `0d044a5` (mobile map scroll cue under elevation). Hard-refresh and compare the footer hash.
- AC100 training overlaps backfilled in DB (all 6 routes).
- Repository: `main` @ `0d044a5` on `origin/main`.

## Just finished

- Map & Aid Stations (mobile): shorter map (`34vh`) plus “Route stats & aid stations below” tap/scroll cue under the elevation profile (`0d044a5`).
- Mobile Resources tap fix; clean `de8fabc` redeploy; amenity icons / ability prediction UI.
