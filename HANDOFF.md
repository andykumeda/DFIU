# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main` @ `ec5e8fc`  
**Status:** Strava elev gain fix deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `ec5e8fc` (hard-refresh; compare footer via `git describe --always --dirty --abbrev=7`).
- Wilson Loop elev updated in DB to **3868 ft** (was 4073); Routesmith lap still **3742**.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- Dense StravaGPX elev escalate threshold 1.45 → 1.05 so residual jitter uses 400m+10ft smoothing (~−200 ft on Wilson Loop).

## Open / follow-up

- Training detail Mapbox basemap.
- Overlap accuracy (Wilson Loop).
- Pace copy: duration + `(pace/mi)` only.
- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
