# Handoff Document

**Date:** 2026-06-09
**Status:** Aid-station default delay moved to the per-user Runner Profile; pace-chart sticky-header gap fixed. Built + deployed.
**Active task:** Verify in production: Settings → Runner Profile "Default aid-station stop" stepper drives the pace-chart Stop column, and the blank strip above the splits table is gone.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change in this repo. Commit, branch, and document discipline is required to prevent the lost-work confusion that motivated this reconciliation.

## 2026-06-09 Aid-station default delay (per-user) + pace-chart gap

- **Aid-station default stop is now a per-user Runner Profile setting.** When the side panel was removed the global default lost its only control (value still defaulted to 2). It now lives in **Settings → Runner Profile** as a `+/- minutes` stepper (`aidStationDefaultDelay`, stored in `profiles.runner_profile` jsonb — no migration needed). Per-station overrides still live inline in the pace-chart **Stop** column (`waypoints.delay`); the chart uses `waypoint.delay ?? runnerProfile.aidStationDefaultDelay`.
  - `PaceCalculator`, `DropBagsSection`, and `CrewView` now read the default from `runnerProfile` instead of `plans`. `usePacePlans` no longer carries `aidStationDefaultDelay`; the `race_pace_plans.aid_station_default_delay` column is left in place but unused.
- **Pace-chart sticky-header gap fixed.** The splits `<thead>` was `sticky` with `top: var(--page-header-h, 112px)`, but its scroll ancestor is the `overflow-x-auto` wrapper (not the page), so the 112px offset pushed the header down inside the wrapper, leaving a ~header-height blank strip (page-relative sticky never actually worked there). Changed to `sticky top-0`; gap removed. Tradeoff: the header no longer pins under the global page header while scrolling a long chart (that behavior was already broken).

## 2026-06-09 Auth + Clone Fixes

- **Signup now offers Strava.** `SignupForm` includes the same `strava-auth` OAuth entry point as login, labeled "Create account with Strava", before the email/password signup fields.
- **Race clone RPC fixed.** Added migration `supabase/migrations/20260610_fix_clone_race_waypoints_updated_at.sql` replacing `clone_race` so its waypoint insert no longer references nonexistent `waypoints.updated_at`. Applied to production via Supabase Management API and verified the old waypoint insert pattern is absent.

## 2026-06-09 Pace/profile/drop-bag batch

- **Sticky pace plan.** The pace chart used to go blank on refresh/revisit until you re-clicked "Generate Plan". `PaceCalculator` now re-renders the plan automatically on load when `race_pace_plans.has_calculated` is set (silent recompute; no toast). The chart is derived, not stored — `has_calculated` is the persisted sticky flag.
- **Runner profile is now per-user (follows the runner across events).** Moved out of the pace plan section entirely. The editor lives in **Settings → Runner Profile** (`RunnerProfilePanel`, extracted to its own file) and saves to a new `profiles.runner_profile jsonb` column. `PaceCalculator` and `DropBagsSection` read it via a `runnerProfile` prop threaded from `RaceDetail`'s profile query; `usePacePlans` no longer carries `runnerProfile`.
  - Migration `supabase/migrations/20260610_profile_runner_profile.sql` — **already applied to production** via the Management API (column verified `jsonb`). The legacy `race_pace_plans.runner_profile` column is left in place but unused.
  - **Known limitation:** `CrewView` reads the *viewing user's* runner profile (correct for the owner-runner). For a separate crew member viewing a runner's plan it falls back to defaults rather than the runner's saved profile. Follow-up if multi-user crew accuracy is needed: resolve the race's `is_runner` member and read their `profiles.runner_profile`.
- **Drop-bag note contrast fix.** Aid-station cards rendered note text with no explicit color (dark-on-dark, unreadable). `DropBagNotes` now sets readable colors: `text-neutral-100` (drop bag notes), `text-blue-50` (tell runner), `text-amber-50` (next leg).
- **Public pace-chart column controls.** Column visibility toggles and reorder arrows are now available to everyone (including public viewers), not just editors. Editors' changes persist to the race; viewers' changes stay local to their session (`usePacePlans.persist` is a no-op without edit permission).
- **Contents-only drop bag popup outside the Drop Bag section.** The `DropBagModal` gained a `contentsOnly` prop. The pace plan's 🎒 popup now shows only what's packed (shared `DropBagSummary`, extracted from Crew View) plus notes — no template/unchecked options, no editor — matching Crew View. The dedicated Drop Bag section keeps the full editor.
- **Runner profile: added Altitude** (weak/avg/strong). Wired into `getRunnerProfileFactor` — above ~5,000 ft it scales the runner's altitude tolerance by elevation, capped ±6%. No migration (profile is jsonb).
- **Configurable aid-station stop time.** New `race_pace_plans.aid_station_default_delay` (migration `20260610_pace_plan_aid_station_default_delay.sql`, applied to prod, default 2 min) feeds `calculatePacePlan` as the fallback for aid stations without an explicit `waypoints.delay`. All three call sites (pace, drop bags, crew) pass it.
  - Surfaced as a **"Stop" column in the pace chart** (editor: inline +/- per row writing `waypoints.delay`; viewer/print: read-only "Nm"). The earlier standalone "Aid Station Stops" side panel was removed in favor of the column. PaceCalculator auto-recomputes the displayed plan when stop times change. `RaceDetail.handleUpdateWaypointDelay` persists optimistically.
- **README** now has a concise "How Pace Is Calculated" section.
- **Pace algorithm roadmap:** distributor-vs-predictor decision recorded in `docs/handoff/next-phase-history-based-pacing.md` for a future phase.

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
