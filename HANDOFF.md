# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Demo CTA moved into header Sign In area (no banner).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `069f749` (header demo link labeled “Demo”). Hard-refresh and compare the footer hash.
- Share alias migration applied on linked DFIU project.
- Repository: `main` @ `069f749` on `origin/main`.
- AC100 training overlaps backfilled in DB (all 6 routes).

## Just finished

- Removed public-event blue demo banner; muted **Demo** link beside Sign In (`?demo=1`, same hover explanation).
- Share URLs: `/{idOrAlias}?share=…`; vanity alias on Members; share view owner chrome without save.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
