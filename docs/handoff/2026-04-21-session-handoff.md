# Session Handoff — 2026-04-21

Focus: elevation algorithm tuned against three Strava ground-truth routes. Prior sessions had left elevation as an unresolved open item.

## Commits Made This Session

```
d3b1d44 fix(elevation): adaptive smoothing window by source-noise detection
de21a25 fix(elevation): accumulate distance before elevationProfile push
63c5cc4 fix(elevation): 60m distance-window smoothing before summation
25c5426 fix(elevation): drop median filter; naive sum of positive deltas
```

Also pushed 30 pre-existing commits from prior sessions to `origin/main` at start of session (1442b20 → origin).

## What Shipped

### Elevation gain/loss now within ~2% of Strava

| Race | GPX Source | DFIU gain | Strava gain | Error |
|---|---|---|---|---|
| Bay Area 100 | StravaGPX (DEM) | 18,087 ft | 18,386 ft | −1.6% |
| Leona Divide 50 | GPX RubyGem | 7,878 ft | 7,913 ft | −0.4% |
| Cocodona 250 | COROS Wearables | 39,287 ft | 38,791 ft | +1.3% |

### Algorithm

File: `src/lib/gpx-parser.ts`.

1. First pass: build `elevationProfile` with cumulative distance (miles) and elevation (ft). **Bug fixed this session**: distance was previously assigned before haversine accumulation, so each point carried the prior edge's cumulative distance — off-by-one that shifted the smoothing window and dropped Bay Area 100 by ~300 ft.
2. `computeElevationStatsFromProfile(profile)`:
   - Compute **raw gain** (sum of positive deltas, no smoothing).
   - Compute **60m-smoothed gain** (`sumSmoothed(profile, 60)`).
   - **Noise ratio** = `rawGain / smoothed60Gain`.
   - If ratio > 1.10 → source is noisy → return 100m-smoothed result.
   - Otherwise return 60m-smoothed result.

Observed noise ratios:
- StravaGPX DEM: ~1.03
- RubyGem race export: ~1.21
- COROS wearable: ~1.43

Threshold 1.10 cleanly separates clean from noisy sources.

### Approaches that did not work (history)

| Approach | Bay 100 | Leona | Cocodona | Verdict |
|---|---|---|---|---|
| Hysteresis ≥5m | −1,500ft | −400ft | (untested) | tail-loss drops real gain |
| Median-5 filter + sum | −1,900ft | −91ft | (untested) | over-smooths clean DEM |
| Naive sum (no smoothing) | +194ft | +1,844ft | +5,084ft | over-counts noisy sources |
| Fixed 60m smoothing | −299ft | +152ft | +4,084ft | still over-counts wearable |
| Fixed 100m smoothing | −925ft | −35ft | +496ft | Bay drops out of tolerance |
| **Adaptive 60/100m (shipped)** | **−299ft** | **−35ft** | **+496ft** | all three within 2% |

---

## Still Open

### A. Unverified GPX sources

Only three sources tested (StravaGPX, GPX RubyGem, COROS). Other likely sources not yet validated:
- Garmin Connect exports
- GPX exported from race registration platforms (UltraSignup, RunSignup, Webscorer)
- Wahoo / Suunto / Polar wearables
- Hand-drawn routes (Caltopo, Gaia)

User will experiment with additional routes and flag discrepancies >5%. If a new source class shows systematic error, the adaptive threshold or the two-window values (60/100m) may need retuning — or a third "very noisy" bucket (e.g. 150m) may be warranted.

### B. Existing DB rows carry old values

Elevation is computed at GPX upload and stored on `courses.total_elevation_gain_ft` / `total_elevation_loss_ft`. Deploying new code does **not** update existing rows. Re-upload is the only way to refresh. If a systemic backfill is ever wanted, the `courses.raw_gpx` column has the full GPX stored — a one-off script that re-runs `parseGpx` and updates the row would work.

### C. Elevation loss less rigorously ground-truthed — PROMOTED TO NEXT PHASE

Gains tested against Strava; losses only cross-checked for Cocodona (Strava 33,884 vs DFIU 34,×××, matching direction). User has flagged descents as equally important.

See `docs/handoff/next-phase-descent-verification.md` for the full plan, inputs required from user, and retune playbook.

---

## Key Files Touched This Session

| File | What changed |
|---|---|
| `src/lib/gpx-parser.ts` | New `computeElevationStatsFromProfile` + `sumSmoothed` helpers; fixed distance off-by-one in `parseGpx`; dropped old `computeElevationStats` + `medianFilter`. |

## Test Harness

Offline grid-search scripts used this session live under `/tmp/elev_test*.mjs`. Raw GPX for the three tested races pulled via Supabase MCP into `/tmp/{bay100,leona,cocodona}.gpx`. If re-tuning is needed, grab the GPX from `courses.raw_gpx` the same way and run a shootout.

## Build / Deploy

- `npm run build` — pre-commit hook runs `tsc -b && vite build`.
- `./scripts/deploy-remote.sh` — rsyncs `dist/` to `/var/www/dfiu`.
- Deployed this session at commit `d3b1d44`.
