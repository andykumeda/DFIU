# Handoff Document

**Date:** 2026-08-06
**Branch:** `main`
**Status:** Splash copy, AC100 demo CTA, and signup → settings onboarding shipped.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Current production snapshot

- Frontend: `e3f57ef` (splash tagline/features, AC100 demo CTA, signup → settings). Hard-refresh and compare the footer hash.
- Share alias migration applied on linked DFIU project.
- Repository: `main` @ `e3f57ef` on `origin/main`.

## Just finished

- Splash tagline: "Plan the race. Respect the trail. Don't F* It Up."
- Feature cards refreshed (pace plans, crew/drop bags, training/Strava, live race day).
- AC100 demo CTA (`/ac100?demo=1`); public race cards open with `?demo=1`.
- New signups (email + Strava from signup) go to `/settings#runner-profile`; Strava recommended on signup copy.

## Open

- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
- Guest race header polish (Demo vs Clone / hide account chrome) if still needed after logged-out verify.
