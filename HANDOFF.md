# Handoff Document

**Date:** 2026-08-07
**Branch:** `main`
**Status:** Buy Me a Coffee support link configured and deployed; email follow-up remains a later phase.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `9198f67`. Buy Me a Coffee support link is included in the deployed build.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Added the Support DFIU card to Settings and About, plus a persistent footer link across the app. Configured the donation destination as `https://buymeacoffee.com/andyk`; email follow-up is deferred.
- Dual OG banners so Instagram center-crop keeps brand text readable without changing iMessage.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.

## Open

- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
