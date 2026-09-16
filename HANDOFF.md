# DFIU Handoff

**Date:** 2026-09-16
**Branch:** `main`
**Status:** Complete: Safari waypoint editing no longer fails with a native `Invalid value` blocker.

## Current work

- Waypoint editor: Safari-style midnight hour `24` is normalized to valid HTML time hour `00`, and the form now uses explicit app validation instead of browser-native constraint validation. This prevents Safari's generic `Invalid value` blocker and keeps Mileage/Cutoff visible and editable. The focused regression, all 130 tests, build, deploy, and production demo save passed; lint remains at 0 errors / 49 existing warnings. Production bundle: `index-CFduwF4s.js`.

- SMTP setup: Postfix on `web` now provides mandatory-STARTTLS authenticated submission on `dfiu.app:587`; unauthenticated relay attempts are rejected. DFIU remains on its hosted Supabase project, configured as `DFIU <no-reply@dfiu.app>` with a 30-email/hour limit. The unrelated self-hosted Supabase stacks on `web` were not changed.
- Cloudflare DNS now publishes SPF, DKIM selector `smtp202609`, and monitoring-only DMARC. Public DNS, certificate validation, SMTP authentication, relay rejection, DKIM key matching, and local signed-message delivery passed. Postfix and OpenDKIM are active; certificate renewal reloads Postfix automatically.
- No application build or frontend deploy was needed. The deployed product remains `c9c4fb0`; this batch changes server infrastructure, hosted Supabase Auth configuration, Cloudflare DNS, and deployment documentation only.

- Moved Print Columns below Goal Setting in the Pace Plan left column; hid the estimated-finish card and Strava race-history times while preserving their existing data/calculation wiring.

- Event-specific Plan A references use `formatPlanALabel` with the configured goal, such as `Plan A (29:00)`. Training deltas distinguish the whole-race goal from the section target; labels follow Pace Plan changes.
- Removed the permanently disabled duplicate history-entry form from Pace Calculator; Settings remains the history editor. Removed the unused `cn` helper and its sole dependencies `clsx` / `tailwind-merge`.
- Patched transitive development dependencies `@humanfs/node` and `nanoid`; npm audit reports zero vulnerabilities after the compatible updates.
- Updated user, algorithm, developer, deployment, README, and history-planning documentation. Replaced this accumulated session diary with a current status board; previous evidence remains in git history.
- Audit found all app modules reachable and retained generated database types, historical migrations, compatibility paths, and regression fixtures. No new branch or worktree.
- Validation: 126 tests pass, TypeScript/build/deploy pass, lint has 0 errors / 49 pre-existing warnings, shell/OG-server syntax and relative documentation links pass.
- Live verified at 1280×900 and 390×844: every Training Plan A reference includes the goal; no mobile horizontal overflow. Changing 29:00 → 29:30 updates labels, targets, and deltas without reload; restored 29:00 and verified persistence. Crew/Live labels and the published user guide also verified; browser warning/error log empty.
- CI run `34105276946` passed for exact product SHA `ae144867997d8afe927dca690c4ab9262fb61280`. Product commit pushed; no side branches or worktrees.

## Latest deployed product

- `2bd133c` (`git describe` after deploy): waypoint cutoff normalization and browser-independent form validation. Live production demo verified Mileage/Cutoff values and successful Save dismissal; a fresh reload displayed footer hash `2bd133c`.

- `04c1b18` (`git describe` after deploy): Print Columns reordered; unreliable estimated-finish and Strava race-history UI hidden. Build, tests, lint, deploy, commit, and push completed. The repository deploy script reports `http://web`; browser verification of the updated production surface was unavailable because that hostname redirected to an unrelated under-construction site and the open `dfiu.app` tab retained the prior cached bundle.

- `ae14486` (`git describe` after deploy): configured Plan A labels and cleanup. Production entry asset: `index-CtwJAhxs.js`. No backend schema/function changes.

## Previous product fix

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
