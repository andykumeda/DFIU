# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main`  
**Status:** Training Mapbox detail + Wilson overlap fix ready to ship.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished (local)

- Training detail: lazy Mapbox basemap (`TrainingRouteMapbox`) with ResizeObserver + SVG fallback; cards stay SVG.
- Overlap: unique course-mile coverage (not one direction streak). Wilson Loop **~9.9 mi (74.9–84.9)** with two training legs; lap finish **~10.4 mi (90.4–100.8)**.
- DB overlaps recomputed for test race.

## Open / follow-up

- Pace copy: duration + `(pace/mi)` only.
- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
