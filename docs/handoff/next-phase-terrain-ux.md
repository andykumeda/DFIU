# Next Phase — Terrain Entry UX Redesign

**Status:** Planned / design + reimplementation.
**Prior reference:** HANDOFF.md §6 "Terrain Canvas Model (2026-02-16)" — flagged a pending TODO ("further refinements expected"). This phase is that refinement.
**Prep landed this session (2026-04-23):** terrain-type constants, colors, and default-difficulty mapping deduped into `src/features/course/terrain-constants.ts`. Single source of truth now feeds `CourseMap.tsx`, `EditTerrainModal.tsx`, and `ElevationProfile.tsx`. TypeScript build verified green. **User to review in next session.**

---

## Goal

Replace the current per-segment click-modal-fill-form workflow with a faster, more visual way to label long stretches of terrain. Terrain type and its difficulty factor feed the pace calculator (`pace-utils.ts`), so every mile of a long race ideally has a correct label.

## Current UX (pain points)

| Pain | Where | Impact |
|---|---|---|
| One modal per segment | `EditTerrainModal.tsx` | 100-mile race with mixed terrain = 20+ modal opens |
| Manual mile-marker typing (start/end) | Modal fields | Slow, error-prone, no snap to existing aid stations |
| Two controls for one concept | Type select + Difficulty slider | Users confused — type sets default, slider quietly overrides |
| No bulk entry | — | Can't say "miles 10–50 are single track" in one action |
| No "paint brush" drag | Paint mode in map | Single click creates fixed 0.5mi stub; user must edit to extend |
| No elevation-profile entry | Profile is display-only | Profile is where terrain is most obvious visually — wasted surface |
| No copy-forward | — | Users re-select the same type repeatedly |
| Difficulty factor isn't visible on map after save | — | Invisible data; users can't audit their work at a glance |

## Proposed UX

Pick one primary pattern, optionally layer the others:

### Option A — Elevation-profile painting (recommended primary)

- Brush-tool toolbar above the elevation profile: select type → drag across profile to paint the range. Real-time preview colored stripe under elevation line.
- Drag endpoints of an existing painted range to extend/trim. Click a range to edit type / difficulty / delete.
- "Fill gaps with default" one-click for "everything else is single_track".
- Snap drag endpoints to aid stations and mile integers (shift-key to free-drag).

### Option B — Segment-list sidebar

- Table of ranges: `[start mile] [end mile] [type dropdown] [difficulty] [delete]`.
- Add-row button. Tab through fields. Paste-from-CSV tolerated.
- Warn when ranges overlap or leave gaps.
- Good complement to Option A for keyboard users.

### Option C — Map-paint mode (improved)

- Current click-drops-0.5mi approach replaced by drag-to-paint along route.
- Drag the route polyline itself while in paint mode; path turns the selected color as you drag.
- Mobile: tap to set start, tap again to set end.

### Unify type + difficulty

- Drop the separate difficulty slider from the default flow. Type's default difficulty is the value.
- Expose an "Advanced" expander for manual difficulty override (rarely needed).
- If kept visible, show difficulty as **read-only** until user explicitly clicks an "override" toggle — so the current confusing dual-control disappears.

### Visual feedback after save

- Always render terrain stripe **under** the elevation profile, regardless of edit mode.
- Always render terrain color on the route polyline in the map, regardless of edit mode.
- Tooltip on hover: `"mi 32.4–41.8: single_track (+15%)"`.

## What the User Must Provide / Decide

1. **Primary pattern** — A, B, C, or combination? Recommend A + B (B as fallback for precision editing).
2. **Type taxonomy** — keep current five (paved / dirt / double_track / single_track / technical) + other? Add more (fire_road, sand, snow, stairs)?
3. **Difficulty semantics** — type-only vs type+override? Recommend override behind advanced toggle.
4. **Default fill** — if user labels only part of the course, assume rest is… what? Race-level `terrain_type`? Undefined (no pace adjustment)?
5. **Mobile constraint** — must entry work on mobile, or desktop-only acceptable for now?

## Data Model

Existing `terrain_nodes` table appears sufficient (mile + type + difficulty). No schema change required unless a third "overridden vs default" boolean is wanted to display differently in UI.

## Work Breakdown

1. Design checkpoint with user on 5 decisions.
2. Ship the new primary-pattern UI (A or B) behind a feature flag / alongside the old modal. Keep both paths briefly for user trial.
3. Migrate default-fill behavior in `pace-utils.ts` if semantics change.
4. Retire the old `EditTerrainModal.tsx` once user confirms the new flow is a superset.
5. Add tooltip + always-on visual feedback across map + elevation profile.
6. Tests: a course with 20+ terrain segments should be labelable in under 60 seconds (benchmark).

## Success Criteria

- Labeling a 100-mile course takes <2 minutes of interaction.
- No duplicate entry of type/difficulty; type's default applies unless user overrides.
- Terrain stripe visible at all times on profile + map, not just in edit mode.
- Pace calculator picks up the labels without code change (existing `difficulty` column still drives pace math).

## Reference

- Shared constants module (landed this session): `src/features/course/terrain-constants.ts`.
- Edit modal (current, candidate for retirement): `src/features/course/EditTerrainModal.tsx`.
- Map paint mode: `src/features/course/CourseMap.tsx` (search `terrainSelection`, `isTerrainMode`).
- Elevation profile rendering: `src/features/course/ElevationProfile.tsx`.
- Pace consumption: `src/features/race/pace-utils.ts` (verify `difficulty` field consumption).

## Relationship to Other Phases

Independent of elevation-loss, RBAC, history-pacing, crew-mode phases. Can ship in parallel.
