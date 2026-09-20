# DFIU Handoff

**Date:** 2026-09-20
**Branch:** `main`
**Status:** Verified and deployed on `main`: the race header exposes a labeled Race Settings control, Event Plan visibly identifies the current planning workspace, and documentation maintenance is part of the release workflow.

## Current work

- **Deployed — race settings discovery** (owner: current agent, `main`): replaced the tiny event-title pencil with a labeled Race Settings button and marked Event Plan as the current planning workspace. Production desktop and 390×844 checks confirm the control opens Edit Race and the responsive header keeps Event Plan, Runner GPS, and Race Settings visible without page overflow. Browser error log is empty. User guide, README, developer checklist, and agent instructions now require affected user and repository documentation to ship with every product change. Product hash `0cfecd2`.

- **Deployed — event setup placement** (owner: current agent, `main`): removed the large Race Support card from Overview, added the same four modes to Edit Race, and added a Registration button label beside Registration URL. Registration labels and support choices save and survive reload; blank labels fall back to Register Now. Edit Race merges the label into the existing resources JSON so unrelated and forward-compatible resource fields survive event edits.
- **Verified**: 140 tests pass; build and deploy pass; lint has 0 errors / 49 existing warnings; critical-file hooks pass. Production desktop and 390×844 checks confirm the Overview hierarchy, compact responsive Edit Race layout, configurable UltraSignup label, conditional Crew tab, Solo removal of Crew/Pacer tabs and crew-only bags, persistence after reload, and an empty browser error log. The AC100 plan was restored to Solo and Register Now after the temporary test.

- **Deployed — Race Support** (owner: current agent, `main`): Overview now saves Solo / Crew only / Pacer only / Crew and pacer per personal plan. Crew/Pacer tabs and header role links follow the selection. Pacer shows pickup points; legacy Pacer URLs redirect to the support-aware tab. Disabled Crew direct links show a return-to-plan message. Event Plan / Runner GPS labels remain readable on mobile.
- **Deployed — Drop Bags**: crew-only bags are omitted without crew from cards, All Bags/print data, and next-bag coverage. Start/Finish locations and saved contents remain; redundant Start Gear, Finish Gear, and Official Drop Bag badges are removed from cards/modals. Crew bags retain identification. Toolbar wraps on mobile.
- **Verified**: all 138 tests pass; build and deploy pass; lint 0 errors / 49 existing warnings; critical-file hooks pass. Chrome production checks at 1280×900 and 390×844 confirm layout and no horizontal overflow. All four modes save and survive reload; Solo/Pacer only omit Clear Creek's crew-only bag and Crew restores it. Pacer pickup list and disabled direct links verified. Browser warning/error log empty. Actual print dialog/output was not exercised; the shared filtered list feeds printing.
- **Verified preservation**: AC100 plan `5c9ccb94-3211-4e8c-b653-31978052ef51` restored to `both`; database confirms unchanged bag-data checksum and member count after testing. No bag contents or memberships edited.
- **Schema/release**: targeted `race_support_mode` migration applied to hosted DFIU only. `races.support_mode` is constrained to four values, defaults to `both`, uses existing RLS, and has explicit column-level SELECT grants without exposing share tokens. No broad migration push. Product commits `7e0b12e`, `10f3f6b`; deployed `git describe`: `10f3f6b`. User guide updated. No remaining acceptance blocker.
- Existing external audit notices remain outside this change: Supabase advisors flag existing SECURITY DEFINER functions, Strava connection RLS without policies, and leaked-password protection; this migration adds no table/function/policy. Deployment dependency audit reports 2 moderate / 1 high notices without dependency changes.


- Invitation delivery UX: DFIU persists team access before attempting Supabase Auth email delivery. Members messaging now emphasizes the saved-access result, avoids exposing raw transport errors, and tells managers to check spam or use resend. Live provider migration remains deferred until a provider and credentials are selected; no WeROCK secrets were reused and no test email was sent.

- Password recovery: the login page now provides “Forgot password?”, sends Supabase Auth reset emails with a recovery redirect, and distinguishes recovery links from invitation links on `/auth/set-password`. Live login and reset-form states verified without submitting credentials.

- Signup error clarity and password management: the signup form now reads JSON error bodies from Supabase `FunctionsHttpError`, translates duplicate-email failures into a Sign in/reset-password instruction, and falls back to a useful generic message. Settings now provides New password, Confirm new password, and Change Password controls using the authenticated Supabase session. Deployed and live Settings UI verified; actual password submission remains user-controlled.

- Waypoint cutoff follow-up: replaced Safari's native time control with browser-independent `HH:MM` entry, added normalization and regression coverage, and made edits verify Supabase's returned `cutoff_time` before reporting success. All 132 tests and the build pass; lint remains at 0 errors / 49 existing warnings. Production demo save changed Redbox to 14:26 and retained it after a full reload; footer hash `6bb4cc3`. Miki's exact Safari/account retry remains the final affected-user confirmation.

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

- `0cfecd2`: labeled Race Settings header control, selected Event Plan state, responsive desktop/mobile placement, and synchronized user/repository documentation. Production button-to-modal behavior and 390×844 layout verified.

- `2ec0c54`: final resource-preserving Edit Race save path. Product UI commit `666dbe7` moves Race Support into Edit Race and adds the configurable registration label. Production footer verified at `2ec0c54`; the AC100 row confirms `support_mode = solo` and `registration_label = Register Now` after testing.

- `10f3f6b`: Race Support and conditional crew bags, Pacer pickup tab, simplified bag badges, and responsive header/toolbar. Production footer verified in Chrome; schema and UI checks above.

- Current release: invitation result messaging and pending-access guidance deployed. 132 tests pass, build passes, lint remains at 0 errors / 49 existing warnings. The app still uses the existing DFIU Auth SMTP relay; moving invitations to a higher-reputation provider remains the next deliverability step.

- Current release: login password recovery is deployed. Live `/login` visibly shows “Forgot password?” and the reset form with “Send reset link”. 132 tests pass, build passes, lint remains at 0 errors / 49 existing warnings. No email or password was submitted during browser verification.

- `a7c3cb0` (`git describe` before this batch): signup error extraction and Settings password controls deployed in the current release. Live Settings reload visibly shows the password section and controls. 132 tests pass, build passes, lint remains at 0 errors / 49 existing warnings. Password mutation was not submitted through browser automation because it changes account credentials.

- `6bb4cc3` (`git describe` after deploy): browser-independent waypoint cutoff entry plus returned-row persistence verification. Production bundle: `index-nV30iY4V.js`; save/reopen/reload passed in the live demo.

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
