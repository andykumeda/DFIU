# Handoff Document

**Date:** 2026-08-08
**Branch:** `main`
**Status:** Adding route-specific training share previews with distinct metadata.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: latest local deploy includes the signup access-code request note, access-code gate, and Buy Me a Coffee support link.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Restored five accidentally emptied production modules and confirmed the TypeScript/Vite build.
- Merged the pace/terrain UI fixes: mobile goal panel and overscroll behavior, print columns below the splits chart, and full terrain-segment highlighting/pan behavior.
- iMessage's composite crawler UA now receives the left-aligned image; Facebook/Instagram still receive the centered image.
- OG HTML responses now include `Content-Length`, correct empty-body `HEAD` handling, and `Vary: User-Agent`.
- Added the Support DFIU card to Settings and About, plus a persistent footer link across the app. Configured the donation destination as `https://buymeacoffee.com/andyk`; email follow-up is deferred.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.
- Added a default `67` access-code gate before either email/password or Strava signup; read-only and demo viewing remain public.

## Open

- Verify route-specific OG title/description for training links after deployment.
- Smoke-test the merged pace/terrain UI in production.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
