# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Terrain visible to read-only / public viewers.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `ed8db71`. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` on `:3457`; `og-default.png` **1200×260** (`?v=261`).

## Just finished

- Map, elevation profile, and TerrainSidebar show terrain for all viewers; edit remains owner-only.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
