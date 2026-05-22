# Handoff Document

**Date:** 2026-05-21
**Status:** Mixed bug-fix/public-events batch implemented, verified, deployed, and ready to commit.
**Current HEAD:** `08ca92b docs: close out role deploy cleanup`.
**Active follow-up:** Commit this product batch without the unrelated dependency refresh.

## Current Task

User provided a mixed, unordered request list:
- Pre-race briefing time cannot enter 24-hour values.
- Crew View route is not in focus and should zoom in.
- Log arrival button is too wide and should match map/content width.
- Plan A/B/C should be green/yellow/red, including arrival times.
- Profile info is not getting saved.
- Allow public/private community "PRs" with contributor credit and owner approval.
- Public list of events.
- Logo/title should go to an event list searchable by name/location/date.
- Keep runner/Strava history for future races.
- Upload photos and/or notes along course.
- Official checkmark designation on the main page.

Review notes:
- Removed the generated `<claude-mem-context>` block from `AGENTS.md`; generated session memory does not belong in tracked repo instructions.
- Reverted the broad `package-lock.json` refresh because this feature/fix batch does not require dependency upgrades.

Implemented in this batch:
- Fixed briefing/resource datetime entry with typed 24-hour date/time controls.
- Tightened Crew View map focus and bottom arrival CTA width.
- Colored Plan A green, Plan B yellow, Plan C red in Crew View and pace-plan arrival time displays.
- Hardened profile saving and added/applied `supabase/migrations/20260521_profile_self_management.sql` for user-owned profile rows.
- Added a public searchable `/events` page and official badges on event cards.
- Linked the app logo/title to `/events` from the dashboard and race detail header.

Deferred design work:
- Community contribution/PR workflow with owner approval, contributor credit, and public/private gates.
- Runner/Strava history model across future races.
- Course photo/note uploads along the route.

Verification status:
- `npm run build` passed.
- Initial sandboxed `npm run deploy` failed because host `web` could not resolve there.
- Escalated `npm run deploy` passed and synced the built app to `andy@web:/var/www/dfiu`.
- `supabase db push --dry-run` could not be used because remote migration history has versions missing from this local repo; applied the profile repair SQL directly with `supabase db query --linked --file migrations/20260521_profile_self_management.sql --workdir supabase`.
- Verified production now has `profiles` SELECT/INSERT/UPDATE self-management policies.
- Local browser smoke check passed for `http://127.0.0.1:5173/events`; the page rendered the Events heading and searchable event input.
- Post-deploy describe: `08ca92b-dirty`.
- The unrelated `package-lock.json` refresh was reverted before commit.

Recent completed implementation:
- Added migration `supabase/migrations/20260520_official_events_role_views_runner_gps.sql`.
- Added role flags, official event fields, waypoint instruction fields, and `runner_locations`.
- Added `/race/:id/runner` and `/race/:id/pacer`; Crew View now uses live runner GPS when fresh.
- Updated invite flow to add crew/pacer as view-log team members.
- Production migration `official_events_role_views_runner_gps` applied to Supabase project `nyjgyyuoscgekavheeqi`.
- Production repair migration `repair_team_membership_policies` applied to remove stale permissive invite policies and enforce team-manager membership control.
- `invite-race-member` Edge Function deployed as version 2 with JWT verification enabled.
- Migration repair committed and pushed; frontend redeployed from clean commit `08ca92b`.

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

1. **Second-account RBAC/invite verification:** test owner/RD, runner, crew, pacer, pending invite, invite acceptance, and anonymous public access with separate accounts.
2. **Community contributions:** design public/private event contribution requests, owner approval, contributor credit, and moderation surface.
3. **Runner history:** persist runner/Strava history for future race planning.
4. **Course media:** add photo and note uploads along course/waypoints.
5. **Weather security:** move Visual Crossing calls out of the client bundle and into a Supabase Edge Function.
6. **Admin UX:** build `/admin` for broader site-admin management beyond the inline official toggle.
7. **Owner transfer:** add a safe owner-transfer flow.
8. **Offline Crew View:** add PWA/app-shell cache, IndexedDB race data cache, offline check-in queue, and reconnect replay if still prioritized.

## Cleanup Notes

This cleanup should leave `HANDOFF.md` as the current source of truth. Older dated files under `docs/handoff/` were historical session notes and can be removed if their useful status is represented here or in focused current docs.

## Resume Checklist

1. Run `git status --short --branch`.
2. If touching product/code, update this file first.
3. Before build/deploy, update this file and any affected current docs for the behavior being shipped.
4. Run `npm run build`.
5. Run `npm run deploy` after every successful build.
6. Update this file with build/deploy results and report `git describe --always --dirty --abbrev=7` so the deployed hash can be compared in the app.
