# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** In progress — fix iMessage share preview (PNG cards, not SVG/HTML).

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `15ec62c`. Hard-refresh and compare the footer hash.
- `share-preview` Edge Function deployed; nginx bot routing live on `dfiu.app`.
- Repository: `main` @ `f27781c` on `origin/main`.

## In progress

- Switch OG images from SVG → PNG (iMessage does not render SVG previews).
- Remove meta-refresh from OG HTML so crawlers keep the tags.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
