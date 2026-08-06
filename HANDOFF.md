# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Showing course terrain to read-only / public viewers (not owner-chrome only).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: see `git describe` after deploy. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` on `:3457`; `og-default.png` **1200×260** (`?v=261`).

## In progress

- Map + elevation + TerrainSidebar receive `terrainNodes` for all viewers; edit stays owner-only.

## Just finished

- Terrain legend labels narrowed; left inset aligned with style switcher.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
