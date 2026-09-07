# DFIU Handoff

**Date:** 2026-09-07
**Branch:** `main`
**Status:** In progress: configured Plan A labels, stale-code cleanup, and documentation refresh.

## Current work

- Event-specific Plan A references use `formatPlanALabel` with the configured goal, such as `Plan A (29:00)`. Training deltas distinguish the whole-race goal from the section target; labels follow Pace Plan changes.
- Removed the permanently disabled duplicate history-entry form from Pace Calculator; Settings remains the history editor. Removed the unused `cn` helper and its sole dependencies `clsx` / `tailwind-merge`.
- Patched transitive development dependencies `@humanfs/node` and `nanoid`; npm audit reports zero vulnerabilities after the compatible updates.
- Updated user, algorithm, developer, deployment, README, and history-planning documentation. Replaced this accumulated session diary with a current status board; previous evidence remains in git history.
- Audit found all app modules reachable and retained generated database types, historical migrations, compatibility paths, and regression fixtures. No new branch or worktree.
- Validation: 126 tests pass, TypeScript passes, lint has 0 errors / 49 pre-existing warnings, shell/OG-server syntax checks pass. Release and live label-change verification pending.

## Latest deployed product

- `9f96133`: final course visits stay continuous in analytical overlap; Start/Finish now name section endpoints.
- Route `02794846-3a75-4287-9964-8e7dfe125c97` has four sections, ending Millard Canyon → Finish (race mi 97.0–101.3 / training mi 18.1–22.5).
- Saved Strava comparison refreshed in the signed-in UI: 42 mins moving / 22 mins faster than matched Plan A. Reload, desktop/mobile display, and highlight through Finish verified.

## Open work and verification gates

- Confirm Strava secret rotation and current Edge Function secret configuration. Do not print secrets or perform a blind migration push; hosted migration history diverges from the checkout.
- Verify RBAC/invites end to end with a second account; add admin and owner-transfer UI if prioritized. See `docs/handoff/next-phase-roles-permissions.md`.
- Continue Settings race-history import and ability-estimate field validation; see `docs/handoff/next-phase-history-based-pacing.md`.
- Crew offline/PWA, driving ETA, and parking metadata remain product decisions; see `docs/handoff/next-phase-crew-mode-directions.md`.
- Finish or retire the Pacer View placeholder and decide on the opt-in post-event feedback email flow.
- Reconcile remaining deploy-hardening ideas only when needed; the current script retains older hashed assets, normalizes permissions, and restarts the OG service.

## Working rules

Read `AGENTS.md` before editing. Commit coherent changes after a successful build, deploy, record the deployed hash, and push `main`. Keep this board concise; long history belongs in git. Current user and algorithm pages are generated from `docs/USER_GUIDE.md` and `docs/ALGORITHMS.md`.
