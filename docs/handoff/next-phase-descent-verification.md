# Next Phase — Elevation **Loss** Ground-Truth Verification

**Status:** Planned / awaiting user-supplied Strava descent numbers.
**Prereq commit:** `d3b1d44` (adaptive 60/100m smoothing shipped for gain).

---

## Goal

Bring elevation **loss** to same accuracy parity as elevation gain (≤2% vs Strava across clean/mid-noise/noisy GPX sources). Descents matter as much as ascents for pacing and the current algorithm has only been spot-checked on Cocodona loss.

## What the User Must Provide

Per route, user supplies:

| Field | Example |
|---|---|
| Race name | `Bay Area 100` |
| GPX source (creator tag) | `StravaGPX` / `GPX RubyGem` / `COROS Wearables` |
| Strava elevation **loss** (ft) | `18,112 ft` |
| Strava activity URL (proof) | `https://strava.com/activities/…` |

Three routes minimum, one per noise bucket:

1. **Clean DEM** — StravaGPX-style (ratio ~1.03). Reuse Bay Area 100 if possible.
2. **Mid-noise** — RubyGem / race-platform export (ratio ~1.21). Reuse Leona Divide 50.
3. **Noisy wearable** — COROS / Garmin / Wahoo (ratio ~1.43). Reuse Cocodona 250 — Strava loss already noted in prior handoff as **33,884 ft**.

If user can hand over the other two Strava loss numbers, no new GPX staging is needed — harness and `/tmp/*.gpx` files already exist.

## Steps (for next agent)

1. **Audit current loss code path.**
   Open `src/lib/gpx-parser.ts`, inspect `computeElevationStatsFromProfile` + `sumSmoothed`. Confirm loss = sum of **negative** deltas on the same smoothed profile used for gain. If loss path skips smoothing or uses raw deltas, that alone may be the bug — fix before retuning.

2. **Pull raw GPX** for each of the three routes from `courses.raw_gpx` (Supabase MCP). Stage under `/tmp/{bay100,leona,cocodona}.gpx` matching prior session's harness layout.

3. **Run offline shootout.**
   Adapt `/tmp/elev_test*.mjs` (from 2026-04-21 session) to report both gain *and* loss. Compare to user-supplied Strava numbers. Record per-source noise ratio on the **loss** side — it may differ from gain ratio (GPS drift is often asymmetric).

4. **Evaluate.**
   - All three ≤2% → no code change. Document result, close phase.
   - Any >5% → retune. Candidate knobs (in order of escalation):
     - Raise loss-side smoothing window (try 80m / 100m / 120m).
     - Separate loss noise-ratio threshold from gain (currently 1.10).
     - Third bucket for very-noisy sources (150m).
     - Completely separate loss pipeline if asymmetry is large.

5. **Ship.**
   - Commit with `fix(elevation):` prefix matching prior style.
   - `npm run build` (pre-commit runs `tsc -b && vite build`).
   - `./scripts/deploy-remote.sh` to push to production.
   - Update `HANDOFF.md` + write new dated session handoff under `docs/handoff/`.
   - Note: existing DB rows retain old loss values. Re-upload refreshes; backfill script optional.

## Success Criteria

| Route | Acceptable Loss Error |
|---|---|
| Bay Area 100 (clean) | ≤2% vs Strava |
| Leona Divide 50 (mid) | ≤2% vs Strava |
| Cocodona 250 (noisy) | ≤2% vs Strava |

If all three hit, phase closes. User accuracy rule (≤2% very close, >5% blocks ship) applies identically to loss.

## Reference Artifacts

- Prior session handoff: `docs/handoff/2026-04-21-session-handoff.md` (gain algorithm history + benchmark table).
- Algorithm file: `src/lib/gpx-parser.ts`.
- Project memory: `~/.claude/projects/-Users-andy-Dev-DFIU/memory/project_elevation_algorithm.md` (retune playbook), `reference_elevation_ground_truth.md` (routes + noise ratios).
- Harness pattern: `/tmp/elev_test*.mjs` (may need regeneration — `/tmp` is volatile).
