# Drop Bag ETA, Pace Plan Persistence, and Performance Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share pace plan inputs (Plans A/B/C) across the Pace Plan and Drop Bags tabs via localStorage, show real per-plan ETAs in Drop Bag cards, lazy-load CourseMap to reduce initial bundle size, and delete a scratch file.

**Architecture:** A new `usePacePlans(raceId)` hook reads/writes plan inputs to localStorage. Both `PaceCalculator` and `DropBagsSection` call this hook independently — no prop drilling. `DropBagsSection` runs `calculatePacePlan` for each of the three plans and displays up to three ETA rows per waypoint card. `CourseMap` is wrapped in `React.lazy` to split the maplibre-gl bundle into a separate async chunk.

**Tech Stack:** React 18, TypeScript, localStorage, Vite (code splitting via dynamic import)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/features/race/usePacePlans.ts` | **Create** | Hook + helpers: localStorage read/write, time string parsing, plan minute computation |
| `src/features/race/PaceCalculator.tsx` | **Modify** | Replace 3 local state vars + local helpers with `usePacePlans`; call `markCalculated()` on Calculate |
| `src/features/race/DropBagsSection.tsx` | **Modify** | Use `usePacePlans`; compute 3 plans; render ETA rows or empty state with link to Pace Plan |
| `src/features/race/RaceDetail.tsx` | **Modify** | Pass `onGoToPacePlan` to `DropBagsSection`; lazy-load `CourseMap` |
| `test_db.ts` | **Delete** | Scratch file — not imported anywhere |

---

## Task 1: Create `usePacePlans` hook

**Files:**
- Create: `src/features/race/usePacePlans.ts`

- [ ] **Step 1: Create the hook file**

```ts
// src/features/race/usePacePlans.ts

export interface PacePlans {
    planATimeStr: string   // HH:MM, default '24:00'
    planBTimeStr: string   // HH:MM or '' (auto-compute midpoint)
    planCBufferStr: string // HH:MM, default '00:30'
    hasCalculated: boolean
}

const DEFAULTS: PacePlans = {
    planATimeStr: '24:00',
    planBTimeStr: '',
    planCBufferStr: '00:30',
    hasCalculated: false,
}

function storageKey(raceId: string) {
    return `pace_plans_${raceId}`
}

function load(raceId: string): PacePlans {
    try {
        const raw = localStorage.getItem(storageKey(raceId))
        if (!raw) return { ...DEFAULTS }
        return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
        return { ...DEFAULTS }
    }
}

function save(raceId: string, plans: PacePlans) {
    localStorage.setItem(storageKey(raceId), JSON.stringify(plans))
}

export function usePacePlans(raceId: string) {
    const [plans, setPlans] = React.useState<PacePlans>(() => load(raceId))

    const update = (patch: Partial<PacePlans>) => {
        setPlans(prev => {
            const next = { ...prev, ...patch }
            save(raceId, next)
            return next
        })
    }

    return {
        plans,
        setPlanA: (v: string) => update({ planATimeStr: v, planBTimeStr: '' }),
        setPlanB: (v: string) => update({ planBTimeStr: v }),
        setPlanCBuffer: (v: string) => update({ planCBufferStr: v, planBTimeStr: '' }),
        markCalculated: () => update({ hasCalculated: true }),
    }
}
```

Add `import React from 'react'` at the top.

- [ ] **Step 2: Add exported helper functions below the hook**

These helpers are used by both `PaceCalculator` and `DropBagsSection`:

```ts
export function parseTimeStr(str: string): number {
    const [h, m] = str.split(':').map(Number)
    return ((h || 0) * 60) + (m || 0)
}

export function parseCutoffMinutes(overallCutoff: string | null | undefined): number {
    if (!overallCutoff) return 0
    if (overallCutoff.includes(':')) {
        const [h, m] = overallCutoff.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
    }
    const val = parseFloat(overallCutoff)
    return isNaN(val) ? 0 : val * 60
}

export function computePlanMinutes(
    plans: PacePlans,
    overallCutoff: string | null | undefined
): { a: number; b: number; c: number | null } {
    const a = parseTimeStr(plans.planATimeStr)
    const cutoff = parseCutoffMinutes(overallCutoff)
    const c = cutoff > 0 ? Math.max(0, cutoff - parseTimeStr(plans.planCBufferStr)) : null
    const bFallbackC = c ?? a * 1.25
    const b = plans.planBTimeStr
        ? parseTimeStr(plans.planBTimeStr)
        : (a + bFallbackC) / 2
    return { a, b, c }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/features/race/usePacePlans.ts
git commit -m "feat: add usePacePlans hook with localStorage persistence"
```

---

## Task 2: Refactor PaceCalculator to use the hook

**Files:**
- Modify: `src/features/race/PaceCalculator.tsx`

- [ ] **Step 1: Replace local state with hook**

At the top of `PaceCalculator.tsx`, add the import:
```ts
import { usePacePlans, computePlanMinutes, parseTimeStr } from './usePacePlans'
```

Inside `PaceCalculator`, replace these three lines:
```ts
// REMOVE:
const [planATimeStr, setPlanATimeStr] = useState('24:00')
const [planBTimeStr, setPlanBTimeStr] = useState('')
const [planCBufferStr, setPlanCBufferStr] = useState('00:30')
```

With:
```ts
const { plans, setPlanA, setPlanB, setPlanCBuffer, markCalculated } = usePacePlans(race.id)
const { planATimeStr, planBTimeStr, planCBufferStr } = plans
```

- [ ] **Step 2: Replace local helper functions with imported ones**

Remove these local functions entirely (they are now in `usePacePlans.ts`):
```ts
// REMOVE all of these:
const parseTimeStr = (str: string) => { ... }
const getPlanCMinutes = () => { ... }
const getPlanAMinutes = () => parseTimeStr(planATimeStr)
const getPlanBAutoMinutes = () => { ... }
```

Replace usages with the imported helpers. Add this after the hook call:
```ts
const { a: planAMinutes, b: planBMinutes, c: planCMinutes } = computePlanMinutes(plans, race.overall_cutoff)
```

- [ ] **Step 3: Update `getStrategyValue` to use computed minutes**

Replace the `getStrategyValue` function:
```ts
const getStrategyValue = (): number => {
    if (strategyMode === 'planA') return planAMinutes
    if (strategyMode === 'planC') return planCMinutes ?? 0
    return planBMinutes
}
```

- [ ] **Step 4: Update `handleCalculate` to call `markCalculated`**

In `handleCalculate`, add `markCalculated()` after `setPlan(result)`:
```ts
const handleCalculate = () => {
    if (!course.elevation_samples) return
    const strategy: PacingStrategy = { mode: 'time', value: getStrategyValue() }
    const profile = course.elevation_samples as { distance: number; elevation: number }[]
    const result = calculatePacePlan(profile, course.total_distance_miles || 0, waypoints, terrainNodes, strategy, race, clock24h)
    setPlan(result)
    markCalculated()
}
```

- [ ] **Step 5: Update setter calls in the JSX**

Find all `setPlanATimeStr`, `setPlanBTimeStr`, `setPlanCBufferStr` calls in the JSX and replace:
- `setPlanATimeStr(e.target.value)` → `setPlanA(e.target.value)`
- `setPlanBTimeStr(e.target.value)` → `setPlanB(e.target.value)`
- `setPlanCBufferStr(e.target.value)` → `setPlanCBuffer(e.target.value)`
- `setPlanBTimeStr('')` → `setPlanB('')`

Also update the `paceStr` calculation area — replace `getStrategyValue()` call with `getStrategyValue()` (no change needed since the function still exists).

- [ ] **Step 6: Update the Plan C "no cutoff" warning**

Find this existing check: `{strategyMode === 'planC' && !race.overall_cutoff && (...)}`

It already uses `race.overall_cutoff` — no change needed.

- [ ] **Step 7: Remove unused `useState` import if no longer needed**

Check if `useState` is still used for `strategyMode` and `plan`. It is — leave the import.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no output.

- [ ] **Step 9: Manual smoke test**

Start dev server (`npm run dev`), open a race with a course, go to Pace Plan tab, set a time for Plan A and click Calculate. Switch to Drop Bags tab and back to Pace Plan — verify the Plan A time you entered is still there (localStorage persisted).

- [ ] **Step 10: Commit**

```bash
git add src/features/race/PaceCalculator.tsx
git commit -m "refactor: PaceCalculator uses usePacePlans hook for persistent plan state"
```

---

## Task 3: Refactor DropBagsSection to show per-plan ETAs

**Files:**
- Modify: `src/features/race/DropBagsSection.tsx`

- [ ] **Step 1: Add imports**

At the top of `DropBagsSection.tsx`, add:
```ts
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import { Target } from 'lucide-react'
```

Update the props interface to add `onGoToPacePlan`:
```ts
interface DropBagsSectionProps {
    race: Race
    course: Course | null
    waypoints: Waypoint[]
    terrainNodes: TerrainNode[]
    clock24h?: boolean
    onGoToPacePlan: () => void
}
```

Update the function signature:
```ts
export function DropBagsSection({ race, course, waypoints, terrainNodes, clock24h = false, onGoToPacePlan }: DropBagsSectionProps) {
```

- [ ] **Step 2: Replace the single `getCalculatedPlan()` with three plan calculations**

Remove the `getCalculatedPlan` function and the `const plan = getCalculatedPlan()` line.

Add this block after the hook declarations at the top of the component:

```ts
const { plans } = usePacePlans(race.id)
const { a: planAMinutes, b: planBMinutes, c: planCMinutes } = computePlanMinutes(plans, race.overall_cutoff)

const buildPlan = (minutes: number) => {
    if (!course?.elevation_samples || minutes <= 0) return null
    return calculatePacePlan(
        course.elevation_samples as { distance: number; elevation: number }[],
        course.total_distance_miles || 0,
        waypoints,
        terrainNodes,
        { mode: 'time', value: minutes },
        race,
        clock24h
    )
}

const planA = plans.hasCalculated ? buildPlan(planAMinutes) : null
const planB = plans.hasCalculated ? buildPlan(planBMinutes) : null
const planC = (plans.hasCalculated && planCMinutes !== null) ? buildPlan(planCMinutes) : null
```

- [ ] **Step 3: Update the `isNight` helper signature**

The existing `isNight` function takes `(arrivalMinutes, wpLat, wpLon)` — no changes needed to the function itself.

- [ ] **Step 4: Replace the single ETA row in each waypoint card with three rows**

Find the block inside `dropBagWaypoints.map(wp => {...})` that renders the arrival ETA. It currently looks like:

```tsx
{arrival && (
    <div className="flex items-center gap-2 text-sm bg-neutral-950/50 p-2 rounded border border-neutral-800">
        <Clock className="w-4 h-4 text-neutral-400" />
        <span className="text-neutral-300">ETA: {arrival.timeOfDay}</span>
        ...
    </div>
)}
```

Replace that entire block with:

```tsx
{!plans.hasCalculated ? (
    <div className="text-center py-3 space-y-2">
        <p className="text-sm text-neutral-500">Set your goal time to see ETAs.</p>
        <button
            onClick={onGoToPacePlan}
            className="text-sm text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 mx-auto transition-colors"
        >
            <Target className="w-4 h-4" />
            Go to Pace Plan
        </button>
    </div>
) : (
    <div className="space-y-1.5">
        {[
            { label: 'A', plan: planA, color: 'text-emerald-400' },
            { label: 'B', plan: planB, color: 'text-blue-400' },
            ...(planCMinutes !== null ? [{ label: 'C', plan: planC, color: 'text-orange-400' }] : []),
        ].map(({ label, plan: p, color }) => {
            const arrival = p?.waypointArrivals.find(a => a.waypointId === wp.id)
            return (
                <div key={label} className="flex items-center gap-2 text-sm bg-neutral-950/50 px-2 py-1.5 rounded border border-neutral-800">
                    <span className={`text-xs font-bold w-4 shrink-0 ${color}`}>{label}</span>
                    <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="text-neutral-300">{arrival?.timeOfDay ?? '—'}</span>
                    {arrival && race.start_datetime && (
                        isNight(arrival.arrivalTime, wp.lat, wp.lon)
                            ? <Moon className="w-3.5 h-3.5 text-blue-300 ml-auto" />
                            : <Sun className="w-3.5 h-3.5 text-yellow-500 ml-auto" />
                    )}
                </div>
            )
        })}
    </div>
)}
```

- [ ] **Step 5: Remove the old `selectedWaypoint && plan &&` guard in DropBagModal**

The `DropBagModal` is opened from `selectedWaypoint` click — it was previously guarded by `plan`. Find:

```tsx
{selectedWaypoint && plan && (
    <DropBagModal
        waypoint={selectedWaypoint}
        race={race}
        arrivalTime={plan.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)}
        isNight={...}
        onClose={() => setSelectedWaypoint(null)}
    />
)}
```

Replace with (use planA for the modal ETA — it's the primary plan):

```tsx
{selectedWaypoint && (
    <DropBagModal
        waypoint={selectedWaypoint}
        race={race}
        arrivalTime={planA?.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)}
        isNight={
            planA?.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)
                ? isNight(planA.waypointArrivals.find(a => a.waypointId === selectedWaypoint.id)!.arrivalTime, selectedWaypoint.lat, selectedWaypoint.lon)
                : false
        }
        onClose={() => setSelectedWaypoint(null)}
    />
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/features/race/DropBagsSection.tsx
git commit -m "feat: Drop Bag cards show Plan A/B/C ETAs from shared pace plan state"
```

---

## Task 4: Wire `onGoToPacePlan` in RaceDetail

**Files:**
- Modify: `src/features/race/RaceDetail.tsx`

- [ ] **Step 1: Pass `onGoToPacePlan` prop to `DropBagsSection`**

Find the `DropBagsSection` render (around line 1236):

```tsx
<DropBagsSection
    race={race}
    course={course || null}
    waypoints={waypoints}
    terrainNodes={terrainNodes}
    clock24h={clock24h}
/>
```

Replace with:

```tsx
<DropBagsSection
    race={race}
    course={course || null}
    waypoints={waypoints}
    terrainNodes={terrainNodes}
    clock24h={clock24h}
    onGoToPacePlan={() => setActiveTab('plan')}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no output.

- [ ] **Step 3: Manual end-to-end test**

1. Open a race with drop bag waypoints and a course
2. Go to Drop Bags tab — should see "Set your goal time to see ETAs." with "Go to Pace Plan" button
3. Click "Go to Pace Plan" — should switch to Pace Plan tab
4. Enter a Plan A time (e.g. `28:00`), click Calculate
5. Go to Drop Bags — should now see Plan A ETA on each card (and Plan B). Plan C only if the race has an overall cutoff.
6. Refresh the page — return to Drop Bags — ETAs should still show (localStorage persisted)

- [ ] **Step 4: Commit**

```bash
git add src/features/race/RaceDetail.tsx
git commit -m "feat: wire onGoToPacePlan prop from RaceDetail to DropBagsSection"
```

---

## Task 5: Lazy-load CourseMap

**Files:**
- Modify: `src/features/race/RaceDetail.tsx`

- [ ] **Step 1: Replace the static CourseMap import with a lazy import**

Find the static import at the top of `RaceDetail.tsx`:
```ts
import { CourseMap } from '@/features/course/CourseMap'
```

Replace with:
```ts
import React, { Suspense, lazy } from 'react'
const CourseMap = lazy(() =>
    import('@/features/course/CourseMap').then(m => ({ default: m.CourseMap }))
)
```

Note: `React` may already be imported — check and only add if missing. `Suspense` and `lazy` need to be added to the existing React import if React is already imported:
```ts
import { useState, useEffect, useMemo, Suspense, lazy } from 'react'
```

- [ ] **Step 2: Wrap the CourseMap render in a Suspense boundary**

Find where `CourseMap` is rendered inside `{activeTab === 'map' && (...)}` and wrap it:

```tsx
<Suspense fallback={
    <div className="w-full h-[600px] bg-neutral-900 animate-pulse rounded-xl flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-neutral-600 animate-spin" />
    </div>
}>
    <CourseMap
        {/* ...all existing props unchanged... */}
    />
</Suspense>
```

`RefreshCw` is already imported in `RaceDetail.tsx`.

- [ ] **Step 3: Build and verify chunk splitting**

```bash
npm run build 2>&1 | grep -E "\.js|error|Error"
```

Expected: you should now see **two or more JS chunks** where there was previously one. The map chunk will be a separate file (`CourseMap-*.js` or similar). The main chunk should be noticeably smaller than 2.4MB.

- [ ] **Step 4: Manual smoke test**

Start dev server, open a race, click the Map tab — map should load (after a brief spinner if first visit). Switch away and back — no spinner on second visit (cached).

- [ ] **Step 5: Commit**

```bash
git add src/features/race/RaceDetail.tsx
git commit -m "perf: lazy-load CourseMap to split maplibre-gl into async chunk"
```

---

## Task 6: Delete test_db.ts

**Files:**
- Delete: `test_db.ts`

- [ ] **Step 1: Delete the file**

```bash
rm /Users/andy/Dev/DFIU/test_db.ts
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build 2>&1 | grep -E "error|Error"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -u test_db.ts
git commit -m "chore: delete test_db.ts scratch file"
```

---

## Self-Review

**Spec coverage:**
- ✅ `usePacePlans` hook with localStorage persistence (Task 1)
- ✅ `PaceCalculator` uses hook, calls `markCalculated()` (Task 2)
- ✅ Drop Bag cards show Plan A/B/C ETAs (Task 3)
- ✅ Plan C only shown if `race.overall_cutoff` exists (Task 3, Step 2)
- ✅ Empty state with "Go to Pace Plan" button when `!hasCalculated` (Task 3, Step 4)
- ✅ `onGoToPacePlan` wired in RaceDetail (Task 4)
- ✅ CourseMap lazy-loaded (Task 5)
- ✅ test_db.ts deleted (Task 6)

**Type consistency:**
- `usePacePlans` returns `{ plans, setPlanA, setPlanB, setPlanCBuffer, markCalculated }` — used consistently in Tasks 2 and 3
- `computePlanMinutes` returns `{ a, b, c }` — used as `planAMinutes / planBMinutes / planCMinutes` in Tasks 2 and 3
- `buildPlan` in Task 3 returns `ReturnType<typeof calculatePacePlan> | null` — consistent with how `planA/B/C` are used

**No placeholders detected.**
