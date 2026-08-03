# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main` @ `e5ba884`  
**Status:** Training Mapbox detail + Wilson overlap fix deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `e5ba884` (hard-refresh; compare footer via `git describe --always --dirty --abbrev=7`).
- Wilson Loop overlap: **~9.9 mi on course (74.9–84.9)**; lap finish **~10.4 mi (90.4–100.8)**.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- Lazy Mapbox Training detail map (ResizeObserver + SVG fallback).
- Overlap uses unique course-mile coverage; DB recomputed.

## Open / follow-up

- Pace copy: duration + `(pace/mi)` only.
- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
