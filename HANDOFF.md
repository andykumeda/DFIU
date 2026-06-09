# Handoff Document

**Date:** 2026-06-09
**Status:** Repo reconciled. Drop-bag notes sync, terrain segment editing, and the deploy/owner-access fixes are now all on `main`, built, and deployed.
**Active task:** Verify terrain editing on production (Bay Area 100), then continue product QA.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change in this repo. Commit, branch, and document discipline is required to prevent the lost-work confusion that motivated this reconciliation.

## 2026-06-09 Reconciliation

Three streams of work had diverged from `main` and were not in production:

1. **Drop-bag notes sync** (`cursor/drop-bag-notes-sync-*`, tip `ddb4311`) — fast-forwarded into `main`.
2. **Terrain segment editing** (`codex/fix-vite-chunk-deploy`) — forked from the old `origin/main` and never merged. Surgically ported onto `main` (see below) instead of merged, to avoid reverting newer RBAC/weather/pace work.
3. **Deploy + owner-access fixes** — stranded uncommitted in a detached worktree (`~/.codex/worktrees/8847/DFIU`). Recovered and committed.

### Terrain editing — what was missing and is now restored

The terrain edit-mode UX existed only on `codex/fix-vite-chunk-deploy`, so production (built from `main`) had no way to enter edit mode and no segment merging.

- **Edit/Done toggle** in the Terrain panel (`TerrainSidebar`, `canEnterEdit`) — owners can enter terrain edit mode directly.
- **Per-segment terrain-type dropdown**, pencil edit, and delete controls; click a segment on the map to edit it.
- **Adjacent same-type segments merge** into one (`getCompactableTerrainNodeIds`) for display and are compacted in the DB on load and after each save. A short (≤0.1 mi) "other" gap between matching types is also collapsed.
- Kept `main`'s richer save logic (out-and-back parallel painting), permission model, and start-line bag badge.
- **No DB migration required:** `user_can_edit_race` / `user_can_manage_team` already exist in production (migrations `20260503_*`, `20260520_*`).

### Deploy / access fixes

- `scripts/deploy-remote.sh` now normalizes remote permissions (755 dirs / 644 files) after every rsync — prevents the prior web-server 500 from `rsync -a` preserving restrictive local perms.
- `supabase/migrations/20260605_grant_andy_owner_edit_access.sql` is now tracked in git (was already applied to production; idempotent, safe to re-run).

## Earlier Feature Batches (already on main)

- Pace chart duplicate-Finish fix; drop bag template editor; customizable race resources + markdown; pace chart column visibility/reorder; Crew View public visibility + drop-bag button + directions; weather extra locations; runner-aware pacing controls.
- Drop-bag map waypoint notes sync into the drop bag view.
- Migrations applied: `20260608_race_templates_and_pace_columns`, `20260609_runner_pacing_profile`, `20260609_weather_locations`.

## Open / Follow-up

- Verify terrain editing end-to-end on production for Bay Area 100 (enter edit mode, change a segment type, confirm adjacent same-type segments merge).
- `codex/fix-vite-chunk-deploy` also carried Vite asset-deploy hardening and production env validation that were **not** ported here; review whether those are still wanted before deleting the branch.
- Standing queue from prior handoffs: second-account RBAC/invite verification; move Visual Crossing weather calls into a Supabase Edge Function; build `/admin` + owner-transfer UI; offline/PWA Crew View if still prioritized.

## Workflow Reminders

- See `AGENTS.md` "Mandatory Agent Workflow" — it governs branching, committing, and documentation for every agent.
- Update this file before starting product work and after build/deploy.
- Run `npm run build` then `npm run deploy` after code changes; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing for commits. Do not remove `scripts/verify-critical-files.sh`.
