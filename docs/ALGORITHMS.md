# DFIU Algorithm Reference

This document explains what DFIU calculates, which inputs matter, and where the models intentionally stop short. It is written for runners who want transparency and for developers who need a stable behavioral reference.

## Pace plans: target-time distribution

Plan A/B/C are goal-time distributors, not finish predictions. For a target time, DFIU solves for a steady baseline grade-adjusted pace that makes the simulated course—including stop time—finish at that target. It then assigns that baseline across short GPX segments.

For a segment, the working relationship is:

```text
segment pace = baseline GAP × grade factor × terrain factor × dynamic conditions × runner-profile factor
```

The result is simulated in course order, so night, weather, fatigue, and arrival time can change from one segment to the next. A numerical bisection search finds the baseline needed for a time-based goal.

### Grade

Grade comes from consecutive GPX elevation samples. DFIU uses the Minetti running energy-cost polynomial, with grade limited to ±45% before evaluation. Uphill generally costs more; moderate downhill helps; and extreme downhill benefit is bounded by the cost curve.

### Terrain

Terrain is stored as boundaries along race mileage. A type stays active until the next boundary. Its difficulty value is used as a multiplier: 100 means no added terrain penalty; 130 means the terrain portion is 30% slower before other factors.

Legacy double-track and single-track values remain readable and map to the current runnable-trail and technical visual vocabulary.

### Dynamic conditions

The standard plan applies these factors during each simulation:

- **Fatigue:** a nonlinear distance-based ramp, reaching approximately +25% by the finish.
- **Altitude:** +1% per 1,000 ft above 5,000 ft, capped at +15%.
- **Night:** determined from race-local twilight when coordinates are available (otherwise 8 PM–6 AM local). It adds a base penalty plus an additional technical-terrain penalty.
- **Heat:** active from 11 AM–6 PM local. Forecast high above 75°F ramps to a maximum +10% at 95°F.
- **Cold:** only at night. Forecast low below 40°F ramps to a maximum +8% at 20°F.

These are transparent planning heuristics, not medical or physiological predictions.

### Runner profile and stops

The runner profile makes bounded adjustments for climbing, descending, flats, technical terrain, mud/snow/sand/rock references, night, heat, cold, altitude, and chosen pacing style. Its combined effect is capped so it cannot overwhelm the course model.

Every eligible aid/crew/drop-bag/water/medical waypoint uses its explicit delay when supplied; otherwise the runner’s default aid-station delay is used. Start, Finish, and landmarks receive no default stop time.

### Live re-anchoring

When a check-in is recorded, the app uses actual elapsed progress to re-extrapolate the remaining plan. This is more grounded than pre-race assumptions, but it still assumes the remaining course will follow the factor model.

## Terrain pairing on out-and-backs

When a terrain range is defined from the map/profile, DFIU examines the course geometry for another continuous pass that:

- is within approximately 25 meters of the selected trail,
- covers at least 70% of the selected section continuously, and
- is traveled in substantially the opposite direction.

The candidate is displayed as a selectable linked range before the terrain is saved. The reverse range is selected by default. Sidebar changes propagate to detected reverse passes to prevent the paired legs from silently drifting apart.

This intentionally does not classify a single intersection, nearby switchback, or same-direction parallel path as an out-and-back. GPS quality and course geometry can still affect matching; review the proposed miles.

Map terrain rendering resolves a terrain endpoint with both location and intended race mile. This distinction prevents an out-and-back endpoint from being drawn on a later visit to the same physical trail.

## Training-route overlap

Training overlap is geometric, not name-based. DFIU:

1. Samples the training route about every 0.05 mi.
2. Snaps each sample to the race course within 0.12 mi (about 200 m), preferring course-mile continuity so start/finish colocation does not flip visits.
3. Bridges brief gaps up to about 0.4 mi for dropouts and switchbacks.
4. Detects clear out-and-back turnarounds:
   - If the race revisits the same trail later (disconnected visits), the return leg maps onto that later pass — separate segments and times of day (e.g. Shortcut to Newcomb).
   - If the race itself is a continuous out-and-back, course miles keep advancing through the turnaround as one span (e.g. Shortcut to Hillyer).
5. Merges nearby course-mile clusters within 1.25 mi for displayed coverage summaries.
6. Filters the special false match that can occur when a course Start and Finish share coordinates.

The total overlap is unique course-mile coverage across the assigned race-mile ranges.

Map coloring snaps training GPX to the race line within about 0.035 mi and paints orange on the race line for those race miles, not along a nearby training detour. A stretch is orange only when snapped race miles advance with the training line (same trail), including a shared stem after the race turns onto a loop. An off-course canyon dip or fire-road approach stays blue.

## Strava training analysis

For every detected overlap pair, DFIU calculates the Plan A time for only that race-mile span. It compares that span with the corresponding training-mile span independently; it does not create one misleading total for a whole training run with disconnected overlap sections.

Strava moving time is used exclusively. With distance/time/moving streams, DFIU apportions moving seconds to the exact overlap interval. Without streams, it falls back to a distance-weighted share of total moving time. Approach miles, breaks, and elapsed time are excluded from the comparison as far as the available data permits.

## What the algorithms do not do

- They do not replace race, medical, weather, access, or navigation judgment.
- They do not learn a runner-specific physiology model from Strava automatically.
- They do not calculate traffic-aware crew travel time or in-app driving routes.
- They cannot correct an inaccurate GPX, missing elevation data, or a poor GPS trace.

Relevant implementation:
