# Handoff Document

**Date:** 2026-08-05
**Branch:** `main`
**Status:** Ability prediction hidden; map/sidebar amenity icons match Pace plan.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: deploy just shipped (dirty tree during build — refresh after commit hash is known). Hard-refresh and compare the footer hash.
- AC100 training overlaps backfilled in DB (all 6 routes).
- Repository: `main` — amenity icon + prediction UI commit pending push.

## Just finished

- Hid Pace “Ability-based prediction” card (`SHOW_ABILITY_BASED_PREDICTION = false`); keep `predictPace` wired.
- Map badges, aid-station sidebar, and waypoint modal use Pace plan Lucide icons/colors: Users green-400, Footprints blue-400, Backpack orange-300 (`waypoint-amenity-icons.ts`).
- Widened map waypoint stacking to 0.06 mi (`7f6578e`).
