# Handoff Document

**Date:** 2026-06-08
**Status:** Drop-bag map notes now surface in Drop Bags tab (notes + crew relay / next-leg fields).
**Current HEAD:** (pending commit on `cursor/drop-bag-map-notes-706c`).
**Active task:** Continue product QA on Bay Area 100 flows.

## Recovery (2026-06-08)

Tracked source files were deleted from the working tree while uncommitted feature work existed only in the editor session. Recovery steps:

1. Restored deleted tracked files from `git HEAD` (`6721526`).
2. Replayed 10 `Write` + 70 `StrReplace` operations from agent transcript `80d5ea7a-6ce1-413e-bae9-3a7168640211`.
3. `npm run build` succeeded with **identical** production chunk hashes.
4. Added `scripts/verify-critical-files.sh` + husky `pre-commit` / `post-checkout` guards.
5. **Rule:** commit feature batches immediately — never leave multi-file work uncommitted.

## Current Feature Batch (restored + live)

- Pace chart: fix duplicate Finish rows (`pace-utils.ts`).
- Drop bag template editor (`drop_bag_template` JSONB).
- Customizable race resources (`resources_config` JSONB) incl. Schedule of Events + markdown rendering.
- Pace chart column visibility/reorder for print (`pace_chart_columns` JSONB).
- Crew View: public visibility, drop-bag button, directions to next crew station, 🎒 emoji.
- Weather: additional course locations (`weather_locations` JSONB) with midway default.
- Supabase migrations applied: `20260608_race_templates_and_pace_columns`, `20260609_weather_locations`.

## Completed Work (2026-06-08)

- Crew View drop bag modal: show notes.
- Pace chart aid station: option to open drop bag info.
- Start-line bag (not labeled "drop bag") in planner + map by default.
- Runner strengths/weaknesses + pacing style inputs feeding pace algorithm.
- Day/night, weather, surface preferences in pace algorithm.

## Workflow Reminders

- Update this file before starting product work.
- Run `npm run build` then `npm run deploy` after code changes.
- Display `git describe --always --dirty --abbrev=7` after deploy.
- Do not use GPG signing for commits.
