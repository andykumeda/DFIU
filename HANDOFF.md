# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Demo CTA moved into header Sign In area (no banner).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: pending this deploy. Prior: `b10e8c8` share vanity + read-only chrome.
- Share alias migration applied on linked DFIU project.
- Repository: `main` (ahead pending commit).
- AC100 training overlaps backfilled in DB (all 6 routes).

## Just finished

- Removed public-event blue demo banner; muted “Try without account” / “Try free” sits beside Sign In with the same `?demo=1` result.
- Share URLs: `/{idOrAlias}?share=…`; vanity alias on Members; share view owner chrome without save.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
