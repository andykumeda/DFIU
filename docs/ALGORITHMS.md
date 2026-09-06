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

## Ability-based prediction

A separate predictor estimates a finish for this course from a calibrated flat baseline, then applies **this event’s** GPX, terrain, night/heat/altitude, limited profile tweaks, and expected aid stops. Past races do not draw the Plan A/B/C chart. They only set how fast the predictor thinks you are. Plan A changes only if you explicitly apply the estimate.

### What the estimated finish and range mean

The card shows one **estimated finish** (internally P50) and a **faster–slower range** (internally P10–P90). These are **not** “10% / 50% / 90% of runners finish by this time,” and they are not percentiles from a results field.

- **Estimated finish:** the model’s simulated total (moving time plus expected stops) for this course.
- **Faster bound:** that same total scaled down by the uncertainty spread.
- **Slower bound:** that same total scaled up by the spread.

The planning spread is at least ±18% with little comparable evidence, or ±11% with total weight ≥ 0.5. It widens to the weighted standard deviation of the historical equivalent paces (as a fraction of their mean) when that is larger. These are heuristic bands, not validated coverage probabilities. Summary-only race history is never labeled high confidence.

### Step 1: Normalize distance and ascent consistently

Each saved finish contributes distance, moving time (or finish time when moving time is unavailable), total gain, and date. Invalid times, gains, and dates are excluded. Finish-only records may include stops; the model cannot infer which portions were stationary.

We use the [ITRA km-effort convention](https://itra.run/FAQ/Organizers): 100 meters of ascent adds one kilometer of effort distance. This is a course-comparison heuristic, not ITRA's race-score algorithm or a physiological guarantee.

```text
effort_miles = distance_miles + gain_ft / 528
equivalent pace = moving_minutes / effort_miles
```

The target course uses the same effort-distance convention. Its grade curve distributes that effort across segments, normalized so its distance-weighted total equals the target effort miles. This prevents the historical and target climbing adjustments from using incompatible scales. Terrain and conditions remain additional planning assumptions; historical summaries do not identify those effects separately.

### Step 2: Weight comparable distances in both directions

```text
weight = exp(−age_in_days / 365) × similarity
similarity = (min(past_miles, target_miles) / max(past_miles, target_miles))²
```

Undated finishes are treated as one year old. For a 100-mile target, 50 miles receives weight 0.25, 100 miles receives 1, and 250 miles receives 0.16 before recency. Both short races and multi-day races have less influence. This weights relevance; it does not claim to have learned an endurance/fatigue curve.

### Step 3: Use observed history when available

The baseline is the weighted mean of usable historical equivalent paces. The old mandatory 20% contribution from the arbitrary 15:00/mile default has been removed. Without usable history, the runner's baseline (default 15:00/mile) remains an explicitly uncalibrated fallback with low confidence. Sparse or distant history lowers confidence instead of pulling the estimate toward an arbitrary slower pace.

### Step 4: Apply that pace to this event’s course

The predictor walks this race’s elevation samples in order:

```text
segment time = calibrated_pace × segment_miles × normalized_grade × terrain × conditions
```

**This event’s** elevation profile enters here:

- **Grade** uses the Minetti energy-cost curve on consecutive GPX points to distribute effort (uphill costs more; moderate downhill helps; extreme downhill is bounded). With history, its aggregate is normalized to the same ascent-based effort distance used for calibration; the uncalibrated fallback retains the original grade curve.
- **Terrain** uses this course’s terrain nodes (`difficulty / 100`).
- **Conditions** stack on that segment’s clock time after the scheduled start: night (~+8%, more on technical trail), altitude above 5,000 ft (small, capped), heat if forecast high is above 75°F during hot hours, and extra cost on steep technical descents.
- In this predictor, the runner profile only tweaks **technical** and **altitude** (weak/strong). Climbing, descending, heat, and pacing-style sliders reshape Plan A’s distribution, not this baseline.

Aid, crew, drop-bag, water, and medical stops add their delay (or the runner’s default). Start, Finish, and landmarks add none. The estimated finish is moving time plus stops. The faster and slower bounds scale that total by the spread above.

### What past elevation does not do

Past races contribute **total gain**, not a mile-by-mile clone of that old course. Stored past terrain difficulty and past altitude are not used in the calibration math. The model does not learn climbing skill from a prior ultra; that remains the Settings strength slider, which mainly affects Plan A.

Strava offers activities tagged as a Race (`workout_type` 1) with sport Run, TrailRun, or VirtualRun, started within the last 1,095 days (three × 365). The listing also stops after eight pages of 200 activities. GPX import uses track distance, elevation, and first-to-last timestamps as finish time. The user chooses which finishes to keep.

## Live re-anchoring

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
   - If the race uses the corridor only once, outbound and return remain separate directional passes; the race-direction pass is used for Plan A and repeated race miles are excluded.
5. Merges nearby course-mile candidate hits within 1.25 mi, then rejects streaks whose training distance does not plausibly follow the race trail.
6. Filters the special false match that can occur when a course Start and Finish share coordinates.

The total overlap is unique course-mile coverage across the accepted race-mile segments only. Nearby candidate hits that fail the trail-following check are excluded from both the segments and the total; repeated passes over the same accepted race miles count once.

Map coloring snaps training GPX to the race line within about 0.035 mi and paints orange on the training line only where those samples sit on the race. Purple is the race; blue is training-only. An off-course canyon dip or fire-road approach stays blue.

## Strava training analysis

For every detected overlap pair, DFIU calculates the Plan A time for only that race-mile span. It compares that span with the corresponding training-mile span independently; it does not create one misleading total for a whole training run with disconnected overlap sections.

Strava moving time is used exclusively. With GPS and distance/time/moving streams, DFIU first correlates the activity trace to the race GPX, then apportions moving seconds to the spatially matched race interval. This handles an activity whose start, finish, or turnaround differs from the saved training route, and counts moving samples even when Strava repeats a rounded distance value. The large GPS stream is used transiently; only compact race/activity segment mappings are saved. Without streams, DFIU falls back to a distance-weighted share of total moving time. Approach miles, breaks, and elapsed time are excluded from the comparison as far as the available data permits.

## What the algorithms do not do

- They do not replace race, medical, weather, access, or navigation judgment.
- They do not learn a runner-specific physiology model from Strava automatically. Selected tagged races only calibrate the independent ability prediction’s flat baseline.
- They do not change Plan A/B/C from history unless the runner applies the estimated finish.
- They do not report 10th/50th/90th percentiles of race results; the faster–slower range is a heuristic band around one simulated finish.
- They do not calculate traffic-aware crew travel time or in-app driving routes.
- They cannot correct an inaccurate GPX, missing elevation data, or a poor GPS trace.

Relevant implementation:
