# Handoff Document

**Date:** 2026-08-07
**Branch:** `main`
**Status:** Signup access-code request note deployed to production.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: latest local deploy includes the signup access-code request note, access-code gate, and Buy Me a Coffee support link.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Added the Support DFIU card to Settings and About, plus a persistent footer link across the app. Configured the donation destination as `https://buymeacoffee.com/andyk`; email follow-up is deferred.
- Dual OG banners so Instagram center-crop keeps brand text readable without changing iMessage.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.
- Added a default `67` access-code gate before either email/password or Strava signup; read-only and demo viewing remain public.
- Added a mail link to `andy@kumeda.com` for visitors who need an access code.

## Open

- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
