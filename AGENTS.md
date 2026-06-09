# Repository Instructions

> **READ THIS FIRST.** These instructions apply to **every agent** that touches
> this repo — Cursor, Codex, Claude, or any other tool, in any worktree. The
> "Mandatory Agent Workflow" below is not optional. It exists because work has
> been lost and confused before by uncommitted changes, stranded worktrees, and
> branches that diverged from `main`. Follow it exactly.

## Mandatory Agent Workflow

Failure to follow these rules is how work gets lost. Do all of them.

### Branching
- **Know your branch before you edit.** Run `git status --short --branch` first.
  State the branch you are on in your response so the user can see it.
- **Default to working on `main`** unless the user explicitly asks for a feature
  branch. If you create a branch, tell the user its exact name and why.
- **Never leave work on a side branch or detached HEAD that the user does not
  know about.** If you end up on a branch other than `main`, either merge it back
  to `main` or explicitly hand off the branch name in `HANDOFF.md` and your reply.
- **Check for other worktrees** (`git worktree list`) before assuming `main` is
  the only place work lives. Stranded worktrees have hidden lost changes here.
- Do not create throwaway/duplicate branches. Reuse or delete them; do not leave
  near-identical branches lying around.

### Committing
- **Commit every feature batch as soon as it builds — never end a turn or a
  session with uncommitted multi-file product work.** Uncommitted changes are not
  recoverable if the working tree is damaged.
- Each commit must be a coherent batch with a Conventional-Commits message
  (`feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`) explaining the *why*.
- Run `npm run build` before committing code; do not commit a broken build.
- Do not use GPG signing. Do not skip hooks. `scripts/verify-critical-files.sh`
  runs on pre-commit/post-checkout — never remove or bypass it.
- After committing on `main`, **push to `origin`** so the remote is not behind.
  Do not leave `main` ahead of `origin/main` at the end of a session.

### Documenting
- **Before** starting product/code work, update `HANDOFF.md` with the current
  task and status so a broken session can resume cleanly.
- **After** finishing, update `HANDOFF.md` with what changed, what was
  deployed, the `git describe` hash, and any branches/worktrees still holding
  unmerged work. `HANDOFF.md` is the single source of truth for current status.
- If you discover work stranded on another branch or worktree, document it in
  `HANDOFF.md` and reconcile it — do not silently leave it.
- `docs/handoff/` is for current planning notes only; dated session history
  belongs in git history, not active docs.

## Project Status

DFIU is a React/Vite/Supabase race-planning app. Current `main` includes RBAC memberships, email invites, DB-backed pace plans, runner check-ins, terrain segment editing, and the mobile-first Crew View.

Use `HANDOFF.md` as the source of truth for current status and open work.

## Build / Deploy / Lint

- Run `npm run build` before finishing code changes.
- After every successful `npm run build`, run `npm run deploy`.
- Display `git describe --always --dirty --abbrev=7` after deploy so the web app footer/hash can be compared.
- `npm run lint` currently passes with warnings; do not introduce new errors.
- Do not revert unrelated user changes. Prefer `rg` for repository search.

## Current Open Work

See `HANDOFF.md` for the active queue. Highlights:

- Crew View drop bag notes; pace chart drop bag access; start-line bag defaults.
- Runner profile (strengths, pacing style, weather prefs) feeding pace algorithm.
- Verify RBAC and invite flows end-to-end with a second account.
- Move Visual Crossing weather calls out of the client bundle and into a Supabase Edge Function.
- Build `/admin` and owner-transfer UI.
- Add offline/PWA support for Crew View if still prioritized.
