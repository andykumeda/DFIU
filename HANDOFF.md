# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main`  
**Status:** In progress — Training overlap Plan A pace + description under name.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Compare footer via `git describe --always --dirty --abbrev=7` after deploy.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## In progress

- Show Plan A predicted pace + time-of-day for training/course overlap segments
- Move notes under Name as Description on training route detail

## Open / follow-up

- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
