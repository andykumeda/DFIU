# Handoff Document

**Date:** 2026-08-03  
**Branch:** `main`  
**Status:** Training detail SVG map + elev gain fix (Routesmith-aligned).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Compare footer via `git describe --always --dirty --abbrev=7` after deploy.
- Test route elev gain updated to **3742 ft** (Routesmith reference **3652 ft**).
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Just finished

- Detail route map uses SVG (no Mapbox) so the polyline always shows
- Elev: aggressive smooth when light/heavy windows diverge; UI shows gain only
- Reference: https://routesmith.app/fe13018a-a4ba-4f59-8fee-de425a502bee (+3652 ft)

## Open / follow-up

- Dirty `DEPLOYMENT.md` / `scripts/deploy-remote.sh` still uncommitted.
- Rotate Strava client secret; RBAC E2E; `/admin`; Pacer View; offline Crew PWA.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
