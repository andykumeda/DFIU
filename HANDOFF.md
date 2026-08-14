# Handoff Document

**Date:** 2026-08-13
**Branch:** `main`
**Status:** Training route detail maps use continuous course-mile tracking and no longer display tiny reverse/duplicate overlap artifacts.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: latest local deploy includes the signup access-code request note, access-code gate, and Buy Me a Coffee support link.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).

## Just finished

- Fixed Training route navigation by restoring immediate local selection while retaining shareable `?training=` URLs. Reselecting the Training tab returns to the list without breaking later card clicks.
- Fixed Training detail-map overlap rendering. The map now tracks continuous course-mile progression with direction-aware proximity and only bridges 0.1-mile gaps. The detail breakdown filters sub-quarter-mile reverse/duplicate snaps such as `24.8–24.6`. Deployed to production with regression coverage.
- Removed the Ask Strava panel and its query gateway. The Training page retains its prior Strava connection and Training Analysis flows.
- Removed page-level bottom padding from standard race-tab shells on mobile while preserving desktop spacing. Production Resources and Overview both measure a 0 px trailing gap at 390x844, with no browser console errors or warnings.
- Enabled Nginx gzip compression for JavaScript, JSON, XML, SVG, CSS, and text responses. Verified the production main bundle now transfers at about 305 KB instead of 1.06 MB and Mapbox at about 462 KB instead of 1.68 MB.
- Contained elastic page overscroll and made the `html`, `body`, and app-root backgrounds opaque dark. Verified the production training detail at 390x844 loads the correct route/title in about 2.8 seconds without exposing a blank page canvas below the content.
- Training-route links preserve the race share token and now expose route-specific Open Graph title/description metadata.
- Restored five accidentally emptied production modules and confirmed the TypeScript/Vite build.
- Merged the pace/terrain UI fixes: mobile goal panel and overscroll behavior, print columns below the splits chart, and full terrain-segment highlighting/pan behavior.
- iMessage's composite crawler UA now receives the left-aligned image; Facebook/Instagram still receive the centered image.
- OG HTML responses now include `Content-Length`, correct empty-body `HEAD` handling, and `Vary: User-Agent`.
- Added the Support DFIU card to Settings and About, plus a persistent footer link across the app. Configured the donation destination as `https://buymeacoffee.com/andyk`; email follow-up is deferred.
- Added public `/about` and `/documentation` pages, with contact email and the maintained user guide rendered in-app. Deployed to production.
- Added a default `67` access-code gate before either email/password or Strava signup; read-only and demo viewing remain public.

## Open

- Last product deployment: Training overlap continuity/artifact fix (current commit); production URL is `https://dfiu.app/race/fca7696b-6093-49a7-be8a-ba3c0a480643?demo=1&training=30a7927b-1283-47ca-9968-45ec803dfef1`.
- Smoke-test the merged pace/terrain UI in production.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
