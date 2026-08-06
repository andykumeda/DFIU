# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Share OG image compacted to 1200×260 (RouteSmith iMessage height).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `f8194e7` — compact `og-default.png` (1200×260). Hard-refresh and compare the footer hash.
- OG: `dfiu-og` on `:3457`; static `og-default.png` is **1200×260** (`?v=260` cache-bust).
- nginx: vanity/UUID paths → OG server (no bot UA sniffing).

## Just finished

- Shortened share preview image from 1200×630 → 1200×260 (~59% shorter; matches RouteSmith compact banner).

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
