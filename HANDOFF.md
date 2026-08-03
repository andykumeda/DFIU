# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main`  
**Status:** Training tab map/overlap/filename fixes deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend deployed with Training map + overlap fixes; compare footer via `git describe --always --dirty --abbrev=7`.
- Test race training overlap stored as mi 90.4–100.8.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

Training tab fixes:
- SVG card previews; Mapbox detail map hardened against `getOwnLayer` crashes
- Default route name from GPX filename
- Overlap: wider buffer, gap bridging, multi-visit mile hints, start/finish collision filter
- Also shipped pending CrewMap style-load guard + ErrorBoundary chunk reload

## Open / follow-up

- Remaining dirty deploy docs (`DEPLOYMENT.md`, `scripts/deploy-remote.sh`) if not included in this commit.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
