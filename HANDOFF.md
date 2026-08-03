# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main` (Training Routes tab shipped)  
**Status:** Training tab live; prior Live/chunk-deploy file dirty work may still be uncommitted beside this batch.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend deployed with Training Routes tab; compare footer via `git describe --always --dirty --abbrev=7`.
- Supabase: `training_routes` table + RLS applied; `clone_race` copies training routes.
- Edge Functions unchanged: `weather` (JWT on), `strava-auth` (`--no-verify-jwt`).
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

Training Routes tab (between Pace Plan and Drop Bags):
- GPX import, card list + detail map, Google Maps directions to start
- Automatic course-overlap computation; free-text notes
- Race editors write; viewers read; overlaps recomputed on course GPX replace

## Open / follow-up

- Commit remaining prior Live/chunk files if still dirty (`ErrorBoundary`, `CrewMap`, deploy scripts) when asked.
- Rotate Strava client secret; second-account RBAC E2E; `/admin` + owner transfer; Pacer View; offline Crew PWA.
- Amenity map pins for water/restrooms (deferred).

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
- Keep this file as a concise status board; detailed history lives in git commits.
