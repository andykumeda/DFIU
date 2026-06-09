# Repository Instructions

## Project Status

DFIU is a React/Vite/Supabase race-planning app. Current `main` includes RBAC memberships, email invites, DB-backed pace plans, runner check-ins, and the mobile-first Crew View.

Use `HANDOFF.md` as the source of truth for current status and open work. Files in `docs/handoff/` should be current planning notes only; dated session history belongs in git history, not active docs.

## Workflow

- Before starting product/code work, update `HANDOFF.md` with the current task and status so a broken session can resume cleanly.
- **Commit every feature batch before ending a session.** Never leave multi-file product work uncommitted — uncommitted changes are not recoverable if the working tree is damaged.
- `scripts/verify-critical-files.sh` runs on pre-commit and post-checkout; do not remove it.
- Do not use GPG signing for commits.
- Do not revert unrelated user changes.
- Prefer `rg` for repository search.
- Run `npm run build` before finishing code changes.
- After every successful `npm run build`, run `npm run deploy`.
- Display `git describe --always --dirty --abbrev=7` after deploy so the web app footer/hash can be compared.
- `npm run lint` currently passes with warnings; do not introduce new errors.

## Current Open Work

See `HANDOFF.md` for the active queue. Highlights:

- Crew View drop bag notes; pace chart drop bag access; start-line bag defaults.
- Runner profile (strengths, pacing style, weather prefs) feeding pace algorithm.
- Verify RBAC and invite flows end-to-end with a second account.
- Move Visual Crossing weather calls out of the client bundle and into a Supabase Edge Function.
- Build `/admin` and owner-transfer UI.
- Add offline/PWA support for Crew View if still prioritized.
