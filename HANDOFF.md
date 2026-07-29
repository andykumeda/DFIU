# Handoff Document

**Date:** 2026-07-28  
**Branch:** `main` @ `eaf73d3` (pushed, clean-deployed)  
**Status:** Security hardening + docs refresh complete.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend clean-deployed; footer/hash: `eaf73d3`.
- Supabase project: `nyjgyyuoscgekavheeqi`.
- Edge Functions deployed: `weather` (JWT on), `strava-auth` (`--no-verify-jwt`, OAuth state hardened).
- Secret set: `VISUAL_CROSSING_KEY`.
- Migration applied: `20260728_restrict_public_share_token` — `get_race_share_settings` exists; `anon`/`authenticated` cannot SELECT `public_share_token` (verified).
- `.env` untracked; use `.env.example`. Local `.env` should remain on disk for deploy vars.
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## Shipped this batch

1. Env hygiene + `.env.example` + CI (`lint` / `test` / `build`) + Vitest helpers.
2. Strava OAuth HMAC `state` + sessionStorage check; no `listUsers()`; no Strava tokens in `user_metadata`.
3. Weather via Edge Function (no client Visual Crossing key).
4. Share-token lockdown (client `RACE_SELECT` + DB column grants + RPC).
5. Docs/instructions refreshed: `AGENTS.md`, `README.md`, `DEPLOYMENT.md`, `HANDOFF.md`, roles/crew handoff notes.
6. `usePermission.canEditRaceSettings` aligned with RLS (owner / director / runner+edit).

## Open / follow-up

- **Rotate the Strava client secret** (it was previously in git history) and update Supabase `STRAVA_*` secrets.
- Second-account RBAC/invite E2E verification.
- Build `/admin` + owner-transfer UI.
- Offline/PWA Crew View if still prioritized.
- Finish or retire Pacer View placeholder.
- Decide whether to port remaining ideas from `codex/fix-vite-chunk-deploy` before deleting that branch/worktree.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
- Keep this file as a concise status board; detailed history lives in git commits.
