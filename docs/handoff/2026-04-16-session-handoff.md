# Session Handoff — 2026-04-16

## What This Session Accomplished

All work is committed to `main`. The app is building and TypeScript is clean.

### Commits Made This Session

```
b5286a3 revert: remove Recalculate Stats button and failed naive-summation attempt
400a3d6 fix: replace moving-average smoothing with hysteresis for elevation gain
cc05200 fix: stopPropagation on Go to Pace Plan button, memoize plan computations, remove redundant setPlanB calls
7d2bb63 chore: delete test_db.ts scratch file
1209875 perf: lazy-load CourseMap to split maplibre-gl into async chunk
9bc9611 feat: Drop Bag cards show Plan A/B/C ETAs from shared pace plan state
8bfab4d refactor: PaceCalculator uses usePacePlans hook for persistent plan state
9744c3d fix: harden usePacePlans against NaN, invalid localStorage data, and raceId changes
1b24d96 feat: add usePacePlans hook with localStorage persistence
```

### Features Shipped

1. **Drop Bag ETA from Plans A/B/C** — Each drop bag waypoint card now shows ETAs for Plan A, B, and C pulled from the shared pace plan state. If no plan has been calculated, shows an empty state with a "Go to Pace Plan" button that switches the active tab. Plans persist across sessions via localStorage keyed by `pace_plans_${raceId}`.

2. **CourseMap lazy-loaded** — `maplibre-gl` now splits into a separate async JS chunk (1.7MB), loaded only when the Map tab is active. Main bundle dropped from 2.4MB to 657KB.

3. **Auth/Settings hardening** — `.single()` → `.maybeSingle()` for profile fetches; Settings uses `.upsert()` to handle the case where no profile row exists (Strava auth edge case).

4. **EditTerrainModal fix** — Removed cascading render from `initialEndMile` side-effect in useEffect.

5. **SunCalc integration** — Pace calculator uses precise sunset/sunrise times (via `suncalc`) instead of hardcoded 8pm–6am.

6. **Clone race SQL fix** — `clone_race()` function had wrong column names (`route_geojson` → `geometry`, etc.). Fixed and applied via Supabase MCP.

7. **ScrollToTop component** — Floating button, hidden on print. Already committed in earlier session.

---

## Open Issue: Elevation Gain Under-Counting

**Status: Unresolved. This is the next thing to fix.**

### Symptoms

- **Leona Divide 50**: After this session's hysteresis fix, reported ~400ft under vs Strava.
- **Bay Area 100**: Hysteresis gives ~1500ft under vs Strava (tested with official race website GPX).
- The naive per-point summation approach (tried and reverted this session) made Bay Area 100 **worse**.

### Current Algorithm

File: `src/lib/gpx-parser.ts`, function `computeElevationStats` (line ~81).

Uses **hysteresis with `minGainM = 5.0` meters**:
- Gain is only counted after a cumulative rise of ≥ 5m above the last confirmed low.
- Loss is only counted after a cumulative drop of ≥ 5m below the last confirmed high.
- When the direction reverses before reaching the threshold, the pending gain/loss is **silently dropped** (tail-loss problem).

### Root Cause Analysis

The tail-loss problem: whenever a climb reverses before accumulating 5m above the last low, that pending gain is discarded. For a 100-mile race with thousands of small direction changes, these losses accumulate.

**Example of tail-loss:**
```
100m → 103m → 97m → 108m

With minGainM=5:
  103: 3 < 5, no gain. gainLow stays 100.
  97: drop below low → gainLow = 97 (the 3m rise 100→103 is now gone)
  108: 108-97 = 11 >= 5, gain += 11

Result: 11m counted. True gain: 3+11 = 14m. Lost: 3m.
```

For a 100-mile race this accumulates to hundreds or thousands of feet.

### Why Naive Summation Was Worse

The per-point summation approach (`delta > 0 → gain += delta`) over-counted for the Bay Area 100 official GPX. The official course GPX likely has very dense points that are nearly flat (DEM-derived), and summation picked up cumulative floating-point noise across thousands of near-zero deltas. Result: significantly over-counted.

### What Strava Actually Does

Strava applies SRTM3 elevation correction to GPS data, then smooths with a distance-based window, then sums positive increments. For official course GPX (which may already use DEM elevation), Strava likely applies minimal correction and sums directly.

The fact that Strava and the official race stats agree but our algorithm disagrees in both directions (too low for one file, too high after naive summation on another) suggests the issue is **file-specific**: different GPX sources have different point densities and elevation data quality.

### Approaches Tried and Why They Failed

| Approach | Result | Why |
|----------|--------|-----|
| Moving average window=7 | ~1000ft under (Leona Divide) | Fixed point-count window over-smoothed sparse tracks |
| Hysteresis minGainM=5.0 | ~400ft under (Leona Divide), ~1500ft under (Bay Area 100) | Tail-loss at every direction reversal |
| Naive per-point summation (delta > 0.5m) | Worse on Bay Area 100 | Over-counted near-zero DEM deltas across thousands of points |

### Recommended Next Approach: Two-Pass with Smoothing + Summation

The problem is that different GPX sources need different handling:
- **Sparse GPS device tracks** (50m+ intervals): Need robust noise filtering.
- **Dense DEM-derived course files** (5-10m intervals): Need minimal filtering, direct summation.

A promising direction that hasn't been tried yet:

**Option A: Distance-based smoothing window**
Instead of a fixed point-count window, smooth over a fixed distance (e.g., 30m). This is density-agnostic. After smoothing, sum all positive deltas.

```ts
function smoothByDistance(
    points: { dist: number; ele: number }[],
    windowMeters: number = 30
): number[] {
    return points.map((p, i) => {
        const nearby = points.filter(q => Math.abs(q.dist - p.dist) <= windowMeters / 2)
        return nearby.reduce((s, q) => s + q.ele, 0) / nearby.length
    })
}
```
Then: sum all positive point-to-point deltas on the smoothed output.

**Option B: Accumulate pending gain on reversal (fixed hysteresis)**
When the direction reverses and the pending gain is below threshold, don't drop it — carry it forward to the next segment. This eliminates tail-loss while keeping noise filtering.

```ts
// On reversal: carry pending gain instead of dropping it
let pendingGain = 0
for (let i = 1; i < valid.length; i++) {
    const delta = valid[i] - valid[i - 1]
    if (delta > 0) {
        pendingGain += delta
        if (pendingGain >= minGainM) {
            gain += pendingGain
            pendingGain = 0
        }
    } else {
        // On descent: drop only if the descent is also significant
        if (-delta >= minGainM) pendingGain = 0
    }
}
gain += pendingGain // flush remainder
```

**Option C: Garmin-style (simplest that might work)**
Garmin Connect uses: smooth with a 5-point median filter, then sum all positive deltas.

```ts
function medianFilter(arr: number[], window: number = 5): number[] {
    return arr.map((_, i) => {
        const start = Math.max(0, i - Math.floor(window / 2))
        const end = Math.min(arr.length, i + Math.floor(window / 2) + 1)
        const slice = arr.slice(start, end).sort((a, b) => a - b)
        return slice[Math.floor(slice.length / 2)]
    })
}
```
Then sum all positive point-to-point deltas on median-filtered output.

### Testing Protocol

The next agent should test any new algorithm against **both** known cases:
1. **Leona Divide 50** — expected ~9,800–10,200ft gain (per official race stats/Strava)
2. **Bay Area 100** — expected gain per official race website/Strava import

Upload the same GPX through the app after any algorithm change. Both cases must be within ~200ft of expected before the algorithm is considered fixed.

The user has both GPX files available. The Bay Area 100 GPX came from the official race website.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/gpx-parser.ts` | GPX parsing + elevation algorithm. `computeElevationStats` is the function to fix. |
| `src/features/race/usePacePlans.ts` | Custom hook for shared pace plan state via localStorage |
| `src/features/race/PaceCalculator.tsx` | Pace plan UI, uses `usePacePlans` hook |
| `src/features/race/DropBagsSection.tsx` | Drop bag cards with ETA display |
| `src/features/race/RaceDetail.tsx` | Main race view — tabs, map, sidebar |
| `src/features/race/pace-utils.ts` | Core pace calculation logic (no changes needed) |
| `supabase/migrations/20260307021649_add_drop_bag_options_and_cloning.sql` | Adds drop_bag_name/notes, clone_race() function |

## Supabase Project

Project is **ACTIVE_HEALTHY**. Both migrations applied. MCP tools available for SQL execution.

## Build

- `npm run build` — full production build (required by pre-commit hook)
- TypeScript: `node_modules/.bin/tsc --noEmit`
- The pre-commit hook runs `tsc -b && vite build` — needs `tsc` on PATH. If hook fails with "tsc not found", run `npm install` first to restore `node_modules/.bin/tsc`.
