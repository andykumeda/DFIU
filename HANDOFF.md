# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main` @ `0feadda` (dirty: deploy docs only)  
**Status:** Training tab fixes deployed and pushed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `0feadda` (compare footer via `git describe --always --dirty --abbrev=7`).
- Test route `986b85a7…`: name `LAP-ACT-MLTR-SM-ST-MC-EP`; overlap **10.0 mi on course (mi 90.8–100.8)**, training **6.9–16.7**.
- `finish_lat`/`finish_lon` on `training_routes`; P2P directions when start/finish ≥ 0.35 mi apart.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- Detail Mapbox map resize/style-load hardening
- Overlap direction streaks (out-and-back → forward course span)
- GPX track name / filename defaults; elev labeled as gain (+ loss on detail)
- P2P finish + return Google Maps links

## Open / follow-up

- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
