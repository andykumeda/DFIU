# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Share OG banner left-aligned with tagline restored.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: see `git describe` after deploy. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` on `:3457`; `og-default.png` **1200×260**, left-aligned title + tagline (`?v=261`).
- nginx: vanity/UUID paths → OG server (no bot UA sniffing).

## Just finished

- Left-aligned OG banner text; restored tagline under the brand title.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
