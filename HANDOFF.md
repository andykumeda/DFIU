# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Share previews use RouteSmith-style local OG injector.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `15ec62c` shell + `og-default.png`. Hard-refresh and compare the footer hash.
- OG: `dfiu-og` systemd on `:3457` injects event title into SPA `index.html` for vanity/UUID paths.
- nginx: `scripts/nginx-dfiu.app.conf` proxies those paths to the OG server (no bot UA sniffing).
- Verified: iPhone Safari UA on `/ac100` → `og:title` = `Angeles Crest 100 | 100.8 mi`, SPA `#root` present.

## Just finished

- Ported RouteSmith OG approach: inject meta into real SPA HTML; static orange `og-default.png`.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
