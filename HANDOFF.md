# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Dual OG images — left for iMessage, centered for Instagram/Facebook crawlers.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `677dfa1`. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` on `:3457`.

## In progress

- Add `og-ig.png` (centered) and UA-select image in `og-server.mjs` for Facebook/Instagram bots; keep `og-default.png` left-aligned for iMessage.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
