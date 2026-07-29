# Handoff Document

**Date:** 2026-07-28  
**Branch:** `main`  
**Status:** Security hardening + docs refresh implemented, frontend deployed dirty; commit/push next.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend deployed from dirty tree; footer hash before commit: `def612c-dirty`.
- Supabase project: `nyjgyyuoscgekavheeqi`.
- Edge Functions deployed: `weather` (JWT on), `strava-auth` (`--no-verify-jwt`, OAuth state hardened).
- Secret set: `VISUAL_CROSSING_KEY`.
- Migration applied: `20260728_restrict_public_share_token` (`get_race_share_settings` + column SELECT revoke).
- Extra worktree (unchanged): `/Users/andy/.codex/worktrees/9dfe/DFIU` on `codex/fix-vite-chunk-deploy`.

## This batch (2026-07-28)

1. **Env hygiene:** `.env` removed from git index; `.env.example` added. **Rotate the Strava client secret** (it lived in git history).
2. **Strava auth:** HMAC-signed OAuth `state`, sessionStorage check, email admin lookup (no `listUsers()`), no refresh tokens in `user_metadata`.
3. **Weather:** `weather` Edge Function; client no longer bundles Visual Crossing key.
4. **Share tokens:** `RACE_SELECT` omits `public_share_token`; managers use `get_race_share_settings`.
5. **CI/tests:** `.github/workflows/ci.yml` + Vitest (`npm test`) for race-select / share-link.
6. **Docs:** AGENTS, README, DEPLOYMENT, HANDOFF, roles/crew handoff notes updated. `usePermission.canEditRaceSettings` aligned with RLS (no crew+edit settings UI).

## Open / follow-up

- **Rotate Strava client secret** in the Strava API settings and update Supabase secrets.
- Second-account RBAC/invite E2E verification.
- Build `/admin` + owner-transfer UI.
- Offline/PWA Crew View if still prioritized.
- Finish or retire Pacer View placeholder.
- Decide whether to port remaining ideas from `codex/fix-vite-chunk-deploy` before deleting that branch/worktree.

## Workflow reminders

- `npm test` / `npm run build` then `npm run deploy`; record `git describe --always --dirty --abbrev=7`.
- Do not use GPG signing. Do not remove `scripts/verify-critical-files.sh`.
- Keep this file as a concise status board; detailed history lives in git commits.
