# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Aid-station map terrain legend narrowed and left-aligned.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: see `git describe` after deploy. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` on `:3457`; `og-default.png` **1200×260** (`?v=261`).
- nginx: vanity/UUID paths → OG server (no bot UA sniffing).

## Just finished

- Terrain legend labels: Paved, Smooth dirt, Technical (low/med/high), Other.
- Legend left inset matches MapStyleSwitcher (`left-2` / `sm:left-4`).

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
