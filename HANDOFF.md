# Handoff Document

**Date:** 2026-06-10
**Status:** Drop Bags tab card ETAs simplified to Plan A only; built, linted, and deployed from dirty pre-commit state.
**Active task:** Commit, perform a clean post-commit deploy, and push `main`.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change in this repo. Commit, branch, and document discipline is required to prevent the lost-work confusion that motivated this reconciliation.

## 2026-06-10 Drop-bag modal/template follow-up

- **Branch/worktree check before edits:** working on `/Users/andy/Dev/DFIU` branch `main`, tracking `origin/main`, with a clean working tree. Additional worktree remains at `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.
- **Plan A-only card ETA cleanup:** Drop Bags tab cards now show only Plan A ETA data; Plan B/C display and extra computations were removed from the current bag, next-aid, and next-bag timing rows.
- **Validation/deploy for Plan A-only cleanup:** targeted ESLint passed for touched files; `npm run build` passed; `npm run lint` passed with 39 warnings and no errors; `npm run deploy` passed from dirty hash `607eb86-dirty`. Perform a clean deploy after commit so the footer hash is comparable.
- **Next waypoint ETA follow-up:** each Drop Bags tab card now shows compact next-aid and next-bag rows with Plan A ETA times. The two rows can point at the same waypoint when the next aid station is also a bag point. Next aid includes aid/drop-bag/water/medical/crew/pacer support stops and any waypoint marked crew/pacer/drop-bag accessible.
- **Validation/deploy for next waypoint ETA follow-up:** targeted ESLint passed for touched files; `npm run build` passed; `npm run lint` passed with 39 warnings and no errors; `npm run deploy` passed from dirty hash `61de25f-dirty`; clean post-commit deploy passed from `820902b`. Deployed bundle `/var/www/dfiu/assets/index-CvI0iZq7.js` contains `820902b`. Interactive Browser smoke verification was unavailable because no `iab` browser target was exposed in this thread.
- **Card action label cleanup:** removed the redundant edit/create drop-bag action label from the Drop Bags tab cards; the cards remain clickable and the All Bags side list still exposes explicit Edit/View controls.
- **Validation/deploy for card label cleanup:** targeted ESLint passed for touched files; `npm run build` passed; `npm run lint` passed with 39 warnings and no errors; `npm run deploy` passed from dirty hash `3cb8e3a-dirty`; clean post-commit deploy passed from `f27f3c8`. Deployed bundle `/var/www/dfiu/assets/index-im6LuBp0.js` contains `f27f3c8`.
- **Inline item editing follow-up:** individual item labels in the drop-bag popup modal are now editable text fields for write-enabled users, so users can rename template items like "Sport drink" to a specific brand without a separate edit flow. The pack/unpack toggle remains on the checkbox icon, quantity remains inline, and saved item labels are trimmed.
- **Renamed template persistence:** template merge now matches existing bag items by generated template/smart item id as well as text/category, so a per-bag rename of a template item survives closing and reopening the modal instead of being replaced by the original template label.
- **Validation/deploy for inline edit follow-up:** targeted ESLint passed for touched files; `npm run build` passed; `npm run lint` passed with 39 warnings and no errors; `npm run deploy` passed from dirty hash `f4a4c52-dirty`; clean post-commit deploy passed from `30fbbf5`. Deployed bundle `/var/www/dfiu/assets/index-CnOLqYub.js` contains `30fbbf5`. Interactive Browser smoke verification was unavailable because no `iab` browser target was exposed in this thread.
- **Modal write access:** the dedicated Drop Bags tab now passes the broader write/settings permission into `DropBagModal`, so race directors and other write-enabled users are not forced into view-only bag contents there.
- **All Bags popup access:** the All Bags side list now shows an Edit/View action per bag point and opens the same popup modal from that list. Write-enabled users can open stations that only have template suggestions and pack/edit items from the modal.
- **Template population fix:** drop-bag template parsing now accepts array templates plus common wrapped shapes (`items`, `template`, `drop_bag_template`) and normalizes legacy item labels (`text`, `label`, `name`, `qty`). The modal and All Bags list both use the same template merge/seed helper, so template edits appear before a bag has been saved.
- **Validation/deploy:** `npm run build` passed; `npm run lint` passed with 39 warnings and no errors; `npm run deploy` passed. First deploy was from dirty hash `284c5f0-dirty`; clean post-commit deploy passed from `d64cdbc`. Local production preview responded at `http://127.0.0.1:4173`; interactive in-app Browser verification was unavailable because no browser target was exposed in this thread.

## 2026-06-10 Terrain editing UX improvement

- **Follow-up regression fix:** terrain map selection now uses ordinary route clicks: click once for the start, click again for the end, and drag the map normally to pan. The side-panel and floating-picker trash actions now invoke the delete/save path immediately instead of depending on a browser confirm dialog. `npm run build`, `npm run lint`, and clean `npm run deploy` passed from product commit `404ba01`.
- **Delete/selection regression fix:** side-panel segment deletion now operates on the displayed terrain range, paints it back to undefined terrain, and hides undefined/default ranges from the list. Double-click map selection now listens directly on the map canvas DOM event and uses a wider route snap tolerance. `npm run build`, `npm run lint`, and `npm run deploy` passed from clean commit `c2b1724`.
- **Interaction replacement:** route drag selection has been removed from the map. Terrain map selection now uses double-click for start and double-click for end, while normal map drag-pan remains available in terrain edit mode. Double-click zoom is disabled only while terrain edit mode is active. `npm run build`, `npm run lint`, and `npm run deploy` passed from clean commit `a9d0fe1`.
- **Regression fix:** route drag selection now starts from the map canvas, snaps to nearby route points, and no longer depends on receiving `mousedown` from the route hit-area layer. `npm run build`, `npm run lint`, and `npm run deploy` passed from clean commit `9b6b83f`.
- **Correction:** terrain edit mode no longer shows every terrain boundary node as route dots. The intended interaction is click the route to set the segment start, drag either direction to the segment end, and use only the highlighted route span plus the active start/end handles as feedback. Drag snapping now uses the current mileage as a hint so it is less likely to jump on nearby repeated route sections.
- **Map terrain definition now supports drag-select.** In terrain edit mode, owners can drag across the route to define a segment; the selected route span is highlighted in amber during the drag and remains highlighted while the terrain type picker is open. Click-start/click-end still works as a fallback, and elevation-profile drag selection remains available.
- **Side panel terrain rows now support full segment editing.** The pencil/range control opens inline start-mile, end-mile, and terrain-type fields. Saving rewrites the segment boundaries, preserves terrain outside the edited range, and compacts redundant nodes after save.
- **Validation/deploy:** `npm run build` passed; `npm run lint` passed with 42 warnings and no errors; `npm run deploy` passed from clean commit `bf9b063`. Correction validation: `npm run build` passed; `npm run lint` passed with 41 warnings and no errors; `npm run deploy` passed from clean commit `76498a7`.

## 2026-06-10 Map edit controls and clock preference fix

- **Aid-station editing controls moved to the Aid Stations header.** Owners now see the waypoint **Edit/Done** toggle beside the Aid Stations title, with **+ Add** appearing there while waypoint edit mode is active. The old Route Stats edit button was removed.
- **Waypoint and terrain edit modes are independent.** Entering waypoint edit mode disables terrain edit mode, and entering terrain edit mode disables waypoint edit mode, so adding/editing aid stations no longer depends on the terrain-edit controls.
- **Clock preference gaps fixed in the map flow.** Race overview start time, waypoint cutoff details, and Runner View's last-upload time now honor the user's 12/24-hour preference.
- **Validation/deploy:** `npm run build` passed; `npm run lint` passed with the existing 44 warnings and no errors; `npm run deploy` passed from clean commit `6dcb6c9`.
- **Follow-up clock sweep:** race weather sunrise/sunset and additional course-location sunrise/sunset now parse stored clock strings at display time and render them in the viewer's 12/24-hour preference. `npm run build`, `npm run lint`, and `npm run deploy` passed from clean commit `3a5c0a1`.

## 2026-06-10 Waypoint drag persistence fix

- **Root cause:** `CourseMap` always created waypoint markers with `draggable: true`, but `RaceDetail` only passes `onWaypointMove` while map edit mode is active. Outside edit mode, users could drag a marker visually even though there was no save callback, so the marker appeared to move but the server value stayed unchanged.
- **Fix:** waypoint markers are now draggable only when `onWaypointMove` is wired, and the marker-render effect rebuilds when that edit/save capability toggles. Non-edit markers use a pointer cursor and cannot be dragged.
- **Save verification:** `handleWaypointMove` now asks Supabase to return the updated waypoint id with `.select('id').single()`, so RLS/no-row failures no longer look successful; failed saves log the error and show the actual failure message before refetching server state.
- **Validation/deploy:** `npm run build` passed; `npm run lint` passed with the existing 44 warnings; `npm run deploy` passed from clean commit `6b2b4cd`.
- **Regression correction:** marker dragging must be available whenever an editable user is viewing waypoint markers, not only while terrain/map edit mode is active. `RaceDetail` now passes `onWaypointMove` for editable users independent of `isEditMode`, while `CourseMap` still only makes markers draggable when that save callback exists. `npm run build`, `npm run lint`, and `npm run deploy` passed from clean commit `11eac5d`.

## 2026-06-10 Crew bag planning for crew-accessible aid stations

- **Crew-accessible aid stations without official drop bags can now have crew bags.** The Drop Bags tab now includes crew-accessible non-drop aid stations for editors, labeled as **Crew Bag** with a distinct green/package treatment. Viewers only see those crew bags after a saved bag plan exists.
- **Official drop bags remain separate from crew bags.** `waypoints.has_drop_bag` is unchanged and still means the aid station officially accepts drop bags. Crew bags reuse existing `drop_bag_items`, `drop_bag_name`, and `drop_bag_notes` on the waypoint without changing the official drop-bag flag.
- **Read-only surfaces distinguish bag types.** Pace chart bag icons and Crew View bag buttons now show official drop bags separately from saved crew bags; Crew View's next crew station panel labels non-official handoff supplies as a crew bag.
- **Validation/deploy:** `npm run build`, `npm run lint`, and `npm run deploy` all passed. The first deploy was from dirty worktree hash `1c88f46-dirty`; the clean post-commit deploy hash is `4187ddf`.
- **Branches/worktrees:** main holds the deployed crew-bag work. The separate clean worktree `/Users/andy/.codex/worktrees/9dfe/DFIU` remains on `codex/fix-vite-chunk-deploy`; only its deploy asset-retention/env-validation ideas remain unported.

## 2026-06-09 Pace-plan mobile order + Stop-column default fix

- **Stop column ignored the per-user default (root cause: `waypoints.delay` was `integer DEFAULT 0`).** Every waypoint had `delay = 0`, so `0 !== null` made it look like a real override and the profile default (2 min) was never used — the column showed `0m` everywhere and the pace algorithm skipped the default too. Migration `supabase/migrations/20260610_waypoint_delay_nullable.sql` drops the default (NULL = unset) and converts existing `0`s to NULL. **Applied to production via Management API** — all 105 waypoints now NULL, 0 real overrides. No code change needed (cell + `pace-utils` already treat null/undefined as "use default"); a deliberate 0-min stop is now stored as an explicit `0`.
- **Pace plan mobile layout: chart first, config last.** The left config column (Goal Setting + Print Columns) now uses `order-last lg:order-none` and the results column `order-first lg:order-none`, so on mobile the chart appears on top and the Print Columns panel drops to the bottom. Desktop (lg) layout unchanged.

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
- **Configurable aid-station stop time (historical implementation, superseded above).** This batch first introduced `race_pace_plans.aid_station_default_delay` (migration `20260610_pace_plan_aid_station_default_delay.sql`, applied to prod, default 2 min) as the fallback. That race-level default is now unused; the active model is the per-user `runner_profile.aidStationDefaultDelay` described above, with `waypoints.delay` as nullable per-station overrides.
  - The **"Stop" column in the pace chart** remains the active UI for per-station overrides (editor: inline +/- per row writing `waypoints.delay`; viewer/print: read-only "Nm"). The earlier standalone "Aid Station Stops" side panel was removed in favor of the column. PaceCalculator auto-recomputes the displayed plan when stop times change. `RaceDetail.handleUpdateWaypointDelay` persists optimistically.
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
