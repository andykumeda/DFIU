# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Read-only share links: short URLs + vanity alias + owner-like chrome.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: pending deploy (this session). Hard-refresh and compare the footer hash.
- Share alias migration applied on linked DFIU project (`public_share_alias` + updated `get_race_share_settings`).
- AC100 training overlaps backfilled in DB (all 6 routes).

## Just finished

- Private/read-only share links omit `/race/` (`/{idOrAlias}?share=…`); legacy `/race/:id?share=…` still works.
- Optional vanity `public_share_alias` on Members tab; reserved path names blocked.
- Share view shows owner chrome (terrain sidebar, disabled Import/Create / Edit) with no save/clone/demo CTA.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
