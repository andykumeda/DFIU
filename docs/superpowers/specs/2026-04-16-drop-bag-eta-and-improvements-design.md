# Drop Bag ETA, Pace Plan Persistence, and Performance Improvements

**Date:** 2026-04-16  
**Status:** Approved

---

## Overview

Three independent improvements:

1. **Drop Bag ETA from Plans A/B/C** — Show real pace plan ETAs in Drop Bag cards, using shared localStorage state so the user's plan inputs survive tab switches. When no plan has been calculated yet, show a prompt linking back to the Pace Plan tab.
2. **Bundle size** — Lazy-load `CourseMap` (maplibre-gl is the primary contributor to the 2.4MB JS chunk).
3. **Cleanup** — Delete `test_db.ts` scratch file from repo root.

---

## 1. Drop Bag ETA from Plans A/B/C

### Problem

`PaceCalculator` and `DropBagsSection` are siblings under `RaceDetail`. Pace plan inputs (`planATimeStr`, `planBTimeStr`, `planCBufferStr`) live in local state in `PaceCalculator` — `DropBagsSection` can't see them. Currently `DropBagsSection` uses a hardcoded 80%-of-cutoff estimate, which is often wrong and not labelled as an estimate.

### Solution: `usePacePlans(raceId)` hook + localStorage

Extract all pace plan input state into a custom hook that persists to `localStorage` keyed by `pace_plans_${raceId}`. Both `PaceCalculator` and `DropBagsSection` call this hook — they share the same state without prop drilling.

**Hook shape:**
```ts
interface PacePlans {
  planATimeStr: string      // HH:MM, default '24:00'
  planBTimeStr: string      // HH:MM or '' (auto-compute midpoint)
  planCBufferStr: string    // HH:MM, default '00:30'
  hasCalculated: boolean    // true after user clicks Calculate at least once
}

function usePacePlans(raceId: string): {
  plans: PacePlans
  setPlanA: (v: string) => void
  setPlanB: (v: string) => void
  setPlanCBuffer: (v: string) => void
  markCalculated: () => void
}
```

`hasCalculated` is set to `true` when the user clicks "Calculate" in `PaceCalculator`. It is the gate for whether `DropBagsSection` shows real ETAs or the empty-state prompt.

### Drop Bag Card ETAs

Each drop bag waypoint card shows up to 3 ETA rows — one per plan. Plans are only shown if calculable:
- **Plan A** — always shown (has a default time of 24:00)
- **Plan B** — shown as midpoint of A and C (or user-defined if set)
- **Plan C** — only shown if `race.overall_cutoff` is set

Each row: label (A / B / C) + time of day + sun/moon icon.

### Empty State

When `!hasCalculated`:
- Hide the ETA rows entirely
- Show a short message: *"ETAs will appear here once you set your goal time."*
- Show a button **"→ Set Pace Plan"** that calls `onGoToPacePlan()` prop
- `RaceDetail` passes `onGoToPacePlan={() => setActiveTab('plan')}` to `DropBagsSection`

### Files Changed

| File | Change |
|------|--------|
| `src/features/race/pace-plans-hook.ts` | New — `usePacePlans` hook |
| `src/features/race/PaceCalculator.tsx` | Use hook instead of local state; call `markCalculated()` on Calculate |
| `src/features/race/DropBagsSection.tsx` | Use hook; compute all 3 plans; render ETA rows or empty state |
| `src/features/race/RaceDetail.tsx` | Pass `onGoToPacePlan` prop to `DropBagsSection` |

---

## 2. Bundle Size — Lazy-load CourseMap

### Problem

The entire app bundles into a single 2.4MB JS chunk. `maplibre-gl` (used by `CourseMap`) is the primary contributor. It's only needed on the Map tab, not on initial load.

### Solution

Wrap `CourseMap` in `React.lazy()` with a `Suspense` boundary in `RaceDetail`. The map chunk will split into a separate async bundle loaded only when the Map tab is active.

```tsx
const CourseMap = React.lazy(() => import('@/features/course/CourseMap').then(m => ({ default: m.CourseMap })))
```

Fallback: a simple loading skeleton (neutral-900 bg with a spinner).

### Files Changed

| File | Change |
|------|--------|
| `src/features/race/RaceDetail.tsx` | Replace static import with `React.lazy`, wrap render in `<Suspense>` |

---

## 3. Cleanup

Delete `test_db.ts` from repo root (scratch file, not imported anywhere).

---

## What's Not Changing

- The pace plan calculation logic in `pace-utils.ts` — no changes needed
- Drop bag item checklist, bag name/notes — unchanged
- Database schema — no new migrations needed
- The clone button — already implemented correctly
