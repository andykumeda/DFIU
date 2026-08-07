# Handoff Document

**Date:** 2026-08-07
**Branch:** `main`
**Status:** First-phase DFIU support prompts deployed; email follow-up remains a later phase.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `2e741fa`. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Added the Support DFIU card to Settings and About, plus a persistent footer link across the app. The donation destination is configured with `VITE_DFIU_DONATION_URL`; email follow-up is deferred.
- Dual OG banners so Instagram center-crop keeps brand text readable without changing iMessage.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.

## Open

- Configure `VITE_DFIU_DONATION_URL` when the external donation page is ready.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
