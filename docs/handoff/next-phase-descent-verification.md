# Next Phase - Elevation Loss Verification

**Status:** Deferred. Reopen only if users report descent/loss values that are materially wrong.

## Goal

Verify that elevation loss is within the same practical accuracy range as elevation gain for common GPX sources. The current app calculates route stats from GPX data and uses fallback computation when database values are missing.

## Inputs Needed

Collect at least three representative routes with trusted external descent totals:

| Source Type | Example Input Needed |
|---|---|
| Clean GPX / DEM-like export | Race name, GPX source, trusted descent total |
| Mid-noise race-platform export | Race name, GPX source, trusted descent total |
| Noisy watch export | Race name, GPX source, trusted descent total |

## Work Plan

1. Audit `src/lib/gpx-parser.ts` and confirm gain and loss use the same smoothing path.
2. Run a small offline comparison harness against the three GPX samples.
3. If loss is within tolerance, document the result and close the phase.
4. If loss diverges, tune the loss-side smoothing threshold separately from gain and rebuild affected route stats on upload.

## Success Criteria

- Loss error is close enough for pace-planning use across clean, mid-noise, and noisy GPX sources.
- Any tuning does not regress elevation gain accuracy.
- Existing races keep rendering safely; updated stats can be refreshed by re-upload or a deliberate backfill.
