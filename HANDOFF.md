# Handoff Document

**Date:** 2026-05-20
**Status:** Cleanup in progress. Goal is a clean, committed, pushed, built, and deployed repo.
**Current HEAD before cleanup:** `85f6e7f feat(rbac): email-invite flow for new members`.

## Current Task

User requested a full repo cleanup:
- Update documentation to match the implemented app.
- Remove stale code, stale docs, generated local files, and unused boilerplate.
- Run `npm run build`, then always run `npm run deploy`.
- Display the deployed git hash for comparison in the web app.
- Commit and push the cleanup to GitHub.

## Current Application State

DFIU is a React/Vite/Supabase race-planning app for ultrarunners. Current `main` includes:
- GPX upload, course maps, elevation profiles, route stats, and waypoint management.
- Terrain labeling from the map, elevation profile, and sidebar.
- Terrain/grade/night/weather-aware pace planning.
- Supabase-backed race memberships, RLS helpers, and email invite flow.
- DB-backed pace plans and runner check-ins.
- Mobile-first Crew View at `/race/:id/crew`.
- Drop bags, race resources, settings, and Strava auth integration.

## Open Work

1. **Second-account RBAC/invite verification:** test owner, edit member, view member, pending invite, invite acceptance, and anonymous public access with separate accounts.
2. **Weather security:** move Visual Crossing calls out of the client bundle and into a Supabase Edge Function.
3. **Admin UX:** build `/admin` for site-admin user/race/member management.
4. **Owner transfer:** add a safe owner-transfer flow.
5. **Offline Crew View:** add PWA/app-shell cache, IndexedDB race data cache, offline check-in queue, and reconnect replay if still prioritized.
6. **History-based pacing:** still a planned future phase.
7. **Elevation loss verification:** deferred unless users report bad descent numbers.

## Cleanup Notes

This cleanup should leave `HANDOFF.md` as the current source of truth. Older dated files under `docs/handoff/` were historical session notes and can be removed if their useful status is represented here or in focused current docs.

## Resume Checklist

1. Run `git status --short --branch`.
2. If touching product/code, update this file first.
3. Run `npm run build`.
4. Run `npm run deploy` after every successful build.
5. Report `git describe --always --dirty --abbrev=7` so the deployed hash can be compared in the app.
