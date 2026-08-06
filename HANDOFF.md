# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Demo CTA moved into header Sign In area (no banner).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `19fdf29` (demo try link beside Sign In; no public-event banner). Hard-refresh and compare the footer hash.
- Share alias migration applied on linked DFIU project.
- Repository: `main` @ `19fdf29` on `origin/main`.
- AC100 training overlaps backfilled in DB (all 6 routes).

## Just finished

- Removed public-event blue demo banner; muted “Try without account” / “Try free” sits beside Sign In (`?demo=1`).
- Share URLs: `/{idOrAlias}?share=…`; vanity alias on Members; share view owner chrome without save.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
