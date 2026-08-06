# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Guest race header + event share OG previews shipped.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: pending commit (guest header + OG previews). Hard-refresh and compare the footer hash.
- `share-preview` Edge Function deployed (`--no-verify-jwt`); `SITE_URL=https://dfiu.app`.
- nginx on `dfiu.app` routes link-preview bots to `share-preview` and proxies `/og-image`.

## Just finished

- Guest public-race header: prominent **Demo** (not Clone); no User/avatar/Settings when logged out.
- Share previews: event links get `og:title` = race name + orange SVG card via `/og-image`; site root uses `og-default.png`.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
