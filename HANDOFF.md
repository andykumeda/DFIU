# Handoff Document

**Date:** 2026-08-27
**Branch:** `main`
**Status:** Complete: corrected and deployed Training/Strava calculations for race `fca7696b-6093-49a7-be8a-ba3c0a480643`, route `ec6d73f7-ee26-48eb-8ed9-df6d6f598eb4`, and Strava activity `19868480612`.

> **All agents:** read `AGENTS.md` ("Mandatory Agent Workflow") before making any change.

## Latest deployment

- Preserved GPX direction so an out-and-back training route contributes only the pass matching race direction; a one-pass race corridor can no longer fabricate later course miles from the return leg.
- Added transient Strava `latlng` retrieval and race-GPX correlation. Saved activity mappings use exact activity timestamps for moving-time comparisons and do not persist the large GPS stream.
- Exact GPX verification: training overlap is race mi `0.07–10.31` outbound plus `10.31–0.07` return, with `10.24` unique race miles; Strava's race-direction pass maps to race mi `0.70–10.32` and activity mi approximately `0.04–10.01`.
- Production frontend and `strava-activity` Edge Function deployed. The exact route renders `10.2 mi`, one section, race mi `0.1–10.3`, training mi `0.0–10.4`, and Plan A `2 hours 49 mins`.
- Validation: 109 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes. No side branches or additional worktrees remain.

## Current production snapshot

- Proximity-artifact fix committed as `4f7657f` and deployed. The reported Loma Alta Loop now displays five meaningful sections, without the `Redbox → Redbox` ~0.2-mile artifact.

- Aid-station segmentation feature committed as `bc88736` and deployed. The supplied Clear Creek route shows four sections: Clear Creek → Josephine Peak → Redbox → Newcomb Saddle 1 → Shortcut Saddle 1.

- Initial training overlap display stabilization committed as `e523821` and deployed.
- Training route `06a3df4b-95fb-47b5-b410-526654db6c9e` shows four course-overlap rows and four Training Analysis sections across race mi `11.3–42.6`, training mi `0.0–31.3`.
- Reference route `06a3df4b-95fb-47b5-b410-526654db6c9e` visibly shows Start, Finish, and both Water waypoints from its imported GPX.
- Waypoint GPX is fetched only for the selected route, so route-list loading does not download every large source file.
- Training route `394b45d7-d2ca-451f-97c7-62bdf6451373` now derives statistics from the raw accepted map sections, including the route's opening overlap section.
- Frontend: Pace Plan C shows race cutoff hours plus safety buffer.
- OG: `dfiu-og` serves `og-default.png` (left) by default; Facebook/Instagram UAs get `og-ig.png` (centered).
- Backend: `runner_history.strava_activity_id` applied; `strava-activity` `list-races` deployed.

## Just finished

- Created a global Codex `AGENTS.md` for reusable engineering guidance; removed the duplicated generic section from this repository’s local `AGENTS.md`.
- Configured GitHub Issues, default triage labels, and single-context domain-doc rules in `docs/agents/`; added the harness-neutral `## Agent skills` block to `AGENTS.md`.

- Restored the prior 0.25-mile presentation threshold at the shared Route Plan summary layer: isolated GPX/course proximity blips are excluded from displayed sections, Plan A totals, and Strava comparisons.
- Added a regression that reproduces a 0.2-mile fragment around Redbox and verifies it cannot create a same-station section.
- Exact live verification passed on `training=6a62fba8-e15e-4321-a692-76ac5de1b8c9`: five sections remain, the Redbox row is gone, and the Plan A on-course total updates accordingly.
- Validation: 104 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes.

- Replaced the duplicate Course Overlap and Training Analysis card stacks with a Route Plan: compact training/on-course/Plan A summary, then one selectable section list tied to the map.
- Inline Strava moving time and Plan A delta now appear on those same rows. Multiple analyzed runs remain available through a compact selector; the import controls stay collapsed until needed.
- Validation: 103 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes. The supplied live route visibly renders its four sections once, with its saved Strava comparison inline.

- Corrected the two-minute aid-stop discrepancy: Training’s Plan A time for an aid-to-aid section now starts at the first aid station’s planned departure and ends at the next arrival, exactly as Pace Plan’s Time to Next does.
- Added a regression for Josephine Peak → Redbox’s two-minute starting stop; it verifies the displayed duration is 2:20 rather than the raw 2:22 arrival-to-arrival interval.
- Validation: 103 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes. Production deployment completed successfully; public signed-out view uses its default 29-hour plan and cannot show the saved 33-hour plan.

- Added a shared aid-station section projector that splits cleaned continuous overlaps at official `aid_station` course miles and interpolates the corresponding training-mile boundaries.
- Applied the sections consistently to the interactive map, overlap list, Plan A timing, and per-section Strava moving-time comparisons; total overlap mileage remains unchanged.
- Exact production browser verification passed for the supplied URL: four named sections are visible, selecting Josephine Peak → Redbox highlights that section, and the warning/error console is empty.
- Validation: 102 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes. No side branches or additional worktrees remain.

- Fixed the route-selection race: raw matcher fragments are synchronously normalized for the map's first paint, and deferred overlap results are accepted only when they belong to the current training/course coordinate pair.
- Extended the full Clear Creek production-geometry regression to prove the initial display projection equals the final one-section map calculation.
- Exact browser flow verified from Training previews into the second Clear Creek route: navigation and hard refresh both show `Course mi 11.3–42.6 (training 0.0–31.3)`, with one continuous orange section and a clean console.
- Validation: 101 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes.

- Added shared training-mile hover state: map hover moves the elevation-profile highlight, while profile hover places the matching marker and mileage label on the map.
- Added route-mile-to-coordinate coverage and retained the same synchronization in the SVG map fallback for externally controlled highlights.
- Validation: 101 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes. Live pointer checks passed in both directions at 320, 768, 1024, and 1440 px with an empty browser error/warning console.

- Added the course-style elevation profile beneath training detail maps, including mile and imported GPX waypoint markers.
- Start, Finish, and Water now render as green `S`, red `F`, and blue `W` map badges; the SVG fallback also gives Finish a distinct square shape.
- Elevation samples remain out of the lightweight list query and load only with the selected route detail, alongside its raw GPX.
- Validation: 100 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes. Production browser checks passed at 320, 768, 1024, and 1440 px with an empty error/warning console.

- Added a full production-geometry regression for the seven-fragment/one-continuous-section failure, plus focused continuity, GPX parsing, data projection, and waypoint-feature tests.
- Production browser verification confirmed the single overlap section, four reference-route waypoint markers, and a clean console.
- Validation: 98 tests pass; build passes; lint has 0 errors and 49 pre-existing warnings; `git diff --check` passes.

## Previously finished

- Fixed overlap totals that included rejected nearby candidate hits. The reported Strawberry Peak route now calculates `8.54 mi`; its completed Strava activity independently calculates `10.99 mi` from the full-resolution traces.
- Added a compact real-geometry regression covering the race course, proposed training route, and completed Strava activity.
- Training map hover shows `Race: Mile XX.X | Training: Mile YY.Y` along the route.

## Previously finished

- Preserved raw accepted map sections for statistics while retaining merged ranges only for visual display.
- Confirmed Plan A goal edits recompute the pace plan and all derived Training/Strava comparisons; persisted activity data is intentionally unchanged.
- Fixed the remaining mismatch where the map showed three accepted sections but the summary retained only two continuity-assigned sections.
- Route loading now recomputes overlap sections from current route/course geometry, so existing persisted rows cannot keep stale statistics after algorithm changes.
- Performance fix: route loading uses the grid-based map matcher (~57 ms on the reported route) instead of the full continuity matcher (~2.6 s per route).
- The Pace Plan editor and Training section currently have separate `usePacePlans` instances; the editor's local Plan A change can wait for realtime propagation before Training recalculates.
- Added a same-page custom event so separate hook instances receive Plan A edits immediately; Supabase realtime remains the cross-tab/user path.

## Open

- Last product deployment: Training GPS proximity-artifact filter (`4f7657f`).
- Smoke-test Settings race history (Strava + GPX) and Pace ability card.
- Design and implement the opt-in post-event feedback email flow.
- Rotate Strava secret; verify RBAC with a second account; `/admin` + owner-transfer UI.
