# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Removed the disabled independent finish-prediction feature and its stale documentation.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `3a01e28`. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Dual OG banners so Instagram center-crop keeps brand text readable without changing iMessage.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
