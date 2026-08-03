# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main` @ `661e95a` (dirty until commit)  
**Status:** Training overlap Plan A pace + description deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend deployed; compare footer via `git describe --always --dirty --abbrev=7`.
- Training detail: Description under name; Plan A pace + TOD on overlap segments.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- `getElapsedMinutesAtMile` / `getOverlapRacePace` helpers + tests
- Training tab computes Plan A (Drop Bags pattern) and shows pace + enter–exit clock on overlap
- Notes UI moved under Name as Description

## Open / follow-up

- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
