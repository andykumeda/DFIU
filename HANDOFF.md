# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Read-only share links with short/vanity URLs deployed.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `b10e8c8` (short vanity share links + owner-like read-only chrome). Hard-refresh and compare the footer hash.
- Share alias migration applied on linked DFIU project (`public_share_alias` + updated `get_race_share_settings`).
- Repository: `main` @ `b10e8c8` on `origin/main`.
- AC100 training overlaps backfilled in DB (all 6 routes).

## Just finished

- Share URLs: `/{idOrAlias}?share=…` (no `/race/`); legacy `/race/:id?share=…` still works.
- Optional vanity alias on Members → Read-only share link; reserved names blocked.
- `?share=` view shows owner chrome (terrain, disabled Import/Create/Edit) with no save/clone/demo CTA — intended for sharing a public master as read-only.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
