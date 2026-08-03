# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main`  
**Status:** Training Strava elev gain fix (dense GPX ~−200 ft) ready; ship next.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished (local)

- Elev escalate when 60m gain > 400m×1.05 → 400m+10ft (was 1.45, which skipped dense StravaGPX).
- Wilson Loop DB updated **4073 → 3868 ft**; Routesmith lap unchanged at **3742**.

## Open / follow-up

- Training detail Mapbox basemap.
- Overlap accuracy (Wilson Loop).
- Pace copy: duration + `(pace/mi)` only.
- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
