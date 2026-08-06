# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Fix Plan A race-segment miles double-count on reverse+forward overlaps.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: pending this deploy. Prior: `522fa53`.
- Share alias migration applied on linked DFIU project.
- Repository: `main` (ahead pending commit).

## Just finished

- Plan A “Race Segment Miles” uses unique course coverage (matches “mi on course”); Sam Merrill reverse+forward no longer sums to 15.6 vs 10.4.
- Training list cards: Plan A totals only; segments ordered by race mile.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
