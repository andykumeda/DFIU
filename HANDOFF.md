# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Dual OG images for iMessage vs Instagram.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `13aae81`. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Dual OG banners so Instagram center-crop keeps brand text readable without changing iMessage.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
