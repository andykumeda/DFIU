# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Mobile Resources tap freeze mitigated (sticky/backdrop stacking).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: pending commit hash after this push. Hard-refresh and compare the footer hash.
- AC100 training overlaps backfilled in DB (all 6 routes).
- Repository: `main` — mobile Resources interactivity fix about to land.

## Just finished

- Mobile Resources: opaque sticky header/nav (dropped `backdrop-blur`), `main` `z-0`, ScrollToTop `z-[110]`, tab strip `touch-pan-x`; resource link cards are full-card tap targets.
- Hid Pace ability prediction; aligned crew/pacer/drop icons (`0b8b18c`).
