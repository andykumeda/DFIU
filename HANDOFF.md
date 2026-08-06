# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** iMessage share previews use PNG OG cards.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `15ec62c`. Hard-refresh and compare the footer hash.
- `share-preview` @ `fd35d32`: PNG OG cards (not SVG); no meta-refresh. nginx bot routing live.
- Repository: `main` @ `fd35d32` on `origin/main`.

## Just finished

- Fixed iMessage previews: raster PNG with orange background + event name; dropped meta-refresh that confused crawlers.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
