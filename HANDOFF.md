# Handoff Document

**Date:** 2026-05-20
**Status:** Role/official-event implementation complete; production DB migration, Edge Function deploy, and first frontend deploy completed.
**Current HEAD before role work:** `67ea768 chore: clean repo docs and generated files`.
**Active follow-up:** Commit, push, and redeploy from the clean commit hash.

## Current Task

User approved the role/official-event plan and asked to implement it:
- Site admin designates official source events and assigns race directors.
- Official source events show a blue checkmark.
- Race directors edit official source maps/events.
- Runner clones are private/team race plans linked to an official source.
- Runner controls team membership; crew/pacer can view role screens and log/adjust arrivals, but not edit route/map data.
- Add Full/Runner/Crew/Pacer role switching.
- Crew View is the first full mobile role view.
- Runner View v1 should auto-upload GPS every 60 seconds during the race window while open.

Implementation notes:
- Added migration `supabase/migrations/20260520_official_events_role_views_runner_gps.sql`.
- Added role flags, official event fields, waypoint instruction fields, and `runner_locations`.
- Added `/race/:id/runner` and `/race/:id/pacer`; Crew View now uses live runner GPS when fresh.
- Updated invite flow to add crew/pacer as view-log team members.
- `npm run lint` passes with existing warnings; `npm run build` passes.
- Production migration `official_events_role_views_runner_gps` applied to Supabase project `nyjgyyuoscgekavheeqi`.
- `invite-race-member` Edge Function deployed as version 2 with JWT verification enabled.
- Frontend deployed once from the working tree; final step is commit/push and redeploy from the clean commit hash.

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

1. **Commit/push role-view implementation** and redeploy from clean commit hash.
2. **Second-account RBAC/invite verification:** test owner/RD, runner, crew, pacer, pending invite, invite acceptance, and anonymous public access with separate accounts.
3. **Weather security:** move Visual Crossing calls out of the client bundle and into a Supabase Edge Function.
4. **Admin UX:** build `/admin` for broader site-admin management beyond the inline official toggle.
5. **Owner transfer:** add a safe owner-transfer flow.
6. **Offline Crew View:** add PWA/app-shell cache, IndexedDB race data cache, offline check-in queue, and reconnect replay if still prioritized.

## Cleanup Notes

This cleanup should leave `HANDOFF.md` as the current source of truth. Older dated files under `docs/handoff/` were historical session notes and can be removed if their useful status is represented here or in focused current docs.

## Resume Checklist

1. Run `git status --short --branch`.
2. If touching product/code, update this file first.
3. Run `npm run build`.
4. Run `npm run deploy` after every successful build.
5. Report `git describe --always --dirty --abbrev=7` so the deployed hash can be compared in the app.
