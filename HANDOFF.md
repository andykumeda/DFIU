# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Plan A race-segment miles use unique course coverage.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `e851c11` (unique course miles for Plan A; Sam Merrill double-count fix). Hard-refresh and compare the footer hash.
- Share alias migration applied on linked DFIU project.
- Repository: `main` @ `e851c11` on `origin/main`.

## Just finished

- Plan A “Race Segment Miles” / time use unique course coverage (matches “mi on course”); reverse+forward overlaps no longer double-count.
- Training list cards: Plan A totals only; segments ordered by race mile.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
