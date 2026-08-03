# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main`  
**Status:** Training tab fixes shipping (map, overlap, name, P2P directions, elev labels).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Supabase: `training_routes` + `finish_lat`/`finish_lon`; test route overlap ≈ course mi 90.8–100.8 / training mi 6.9–16.7 (~10.0 mi).
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- Detail Mapbox map: resize/style-load guards + downsampling
- Overlap: direction streaks (out-and-back) → course span, not bridged training length
- Name backfill from GPX track; filename default on upload
- P2P directions (finish + return) when start/finish ≥ 0.35 mi apart
- Elev UI: explicit “gain” (and loss on detail); storage remains gain/loss separate

## Open / follow-up

- Remaining dirty deploy docs (`DEPLOYMENT.md`, `scripts/deploy-remote.sh`) if not included.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
