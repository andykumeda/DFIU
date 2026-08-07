# Handoff Document

**Date:** 2026-08-07
**Branch:** `main`
**Status:** Signup access-code gate completed; production deploy is blocked on the remote SSH step.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `9198f67`. Buy Me a Coffee support link is included in the deployed build.
- Local signup-gate build: verified, but not deployed because `npm run deploy` hung before producing output.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Added the Support DFIU card to Settings and About, plus a persistent footer link across the app. Configured the donation destination as `https://buymeacoffee.com/andyk`; email follow-up is deferred.
- Dual OG banners so Instagram center-crop keeps brand text readable without changing iMessage.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.
- Added a default `67` access-code gate before either email/password or Strava signup; read-only and demo viewing remain public.

## Open

- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
