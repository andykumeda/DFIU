# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** iMessage OG fix — event vanity URLs always serve share-preview HTML.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `15ec62c`. Hard-refresh and compare the footer hash.
- `share-preview` deployed with compressed PNG (~5KB) + JS redirect to `/race/:id`.
- nginx: all event vanity/UUID paths hit OG HTML (not bot-UA-only). Template: `scripts/nginx-dfiu.app.conf`.
- Repository: committing this fix.

## Just finished

- Root cause: iPhone Safari UA received SPA shell (generic DFIU meta), so iMessage never saw event OG tags.
- Fix: vanity event URLs always return OG HTML; browsers JS-redirect to `/race/:id`.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
