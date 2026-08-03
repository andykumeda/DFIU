# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main` @ `6b3ecbb`  
**Status:** Training overlap Plan A pace + description deployed and pushed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `6b3ecbb` (compare footer via `git describe --always --dirty --abbrev=7`).
- Training detail: Description under name; Plan A pace + enter–exit TOD on overlap segments.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- `getElapsedMinutesAtMile` / `getOverlapRacePace` helpers + tests
- Training tab computes Plan A (Drop Bags pattern) and shows pace + clock window on overlap
- Notes UI moved under Name as Description

## Open / follow-up

- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
