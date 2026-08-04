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
- Keep `HANDOFF.md` as a concise status board. Do not append long session diaries.

## Project Status

DFIU is a React/Vite/Supabase race-planning app. Current `main` includes RBAC
memberships, email/no-email invites, private share links, DB-backed pace plans,
runner check-ins, terrain editing, Drop Bags (Start/Finish/crew), Live tab
(stream + results), Crew View, and runner-profile-aware pacing.

Use `HANDOFF.md` as the source of truth for current status and open work.

## Build / Deploy / Lint / Test

- Run `npm run build` before finishing code changes.
- After every successful `npm run build`, run `npm run deploy`.
- Display `git describe --always --dirty --abbrev=7` after deploy so the web app footer/hash can be compared.
- Run `npm test` when touching shared helpers or security-sensitive paths.
- `npm run lint` may pass with warnings; do not introduce new errors.
- Do not revert unrelated user changes. Prefer `rg` for repository search.
- Never commit `.env` / secrets. Use `.env.example` for placeholders. Visual Crossing and Strava secrets belong in Supabase Edge Function secrets, not `VITE_*`.

## Current Open Work

See `HANDOFF.md` for the active queue. Highlights:

- Rotate Strava secret (previously tracked in git) and confirm Supabase function secrets.
- Apply share-token migration + deploy `weather` / updated `strava-auth` Edge Functions.
- Verify RBAC and invite flows end-to-end with a second account.
- Build `/admin` and owner-transfer UI.
- Add offline/PWA support for Crew View if still prioritized.
- Finish or retire the Pacer View placeholder.
- Decide whether to port remaining deploy hardening from `codex/fix-vite-chunk-deploy`.

## Cursor Cloud specific instructions

This repo is a **frontend-only Vite SPA**; there is no backend service in the repo — the
backend is a **hosted Supabase project**. "Running the app" means running the Vite dev
server (`npm run dev`, serves on `http://localhost:5173`). Standard commands are already
documented in `README.md` / `package.json` (`dev`, `lint`, `test`, `build`, `preview`).

- **Env vars are required at dev/build time.** Vite reads `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, and `VITE_MAPBOX_TOKEN` from `.env.local` (gitignored). With
  placeholder/dummy values, the UI renders and all client-side logic works (pace engine,
  routing, and the full `npm test` suite), but **auth, database queries, and Mapbox tiles
  will not function**. For full end-to-end auth/DB/map testing, set real project values as
  Secrets (mirrored into `.env.local`). CI (`.github/workflows/ci.yml`) builds with dummy
  `VITE_*` values, so lint/test/build all pass fully offline.
- **Do not run `npm run deploy`** in the cloud. It is an SSH/rsync push to a production web
  host (`DEPLOY_HOST`) and is unrelated to environment verification; it will fail without
  SSH access. AGENTS.md's "deploy after every build" rule targets the maintainer's real
  environment, not cloud setup runs.
- **Do not run `supabase db push` / migration repair.** The hosted migration history has
  diverged from this checkout and there is no `supabase/config.toml`; see `HANDOFF.md`.
- Git hooks (husky) run on commit: `scripts/verify-critical-files.sh` (fails if core source
  files are missing) plus `lint-staged` (`eslint --fix` on staged `*.ts/tsx`). Never bypass
  or remove them.
