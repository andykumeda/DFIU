import { TerrainNode, Waypoint, Race } from '@/types/database'
import SunCalc from 'suncalc'
import { levelAdjustment, type RunnerPacingProfile } from './runner-profile'

export interface PacingStrategy {
    mode: 'time' | 'pace' | 'gap' | 'cutoff'
    value: number // time in minutes, or pace in minutes/mile
    cutoffBuffer?: number // minutes (only used if generating strategy from cutoff)
}

export interface Split {
    mile: number
    elapsedTime: number // minutes from start
    segmentTime: number // minutes for this segment
    segmentPace: number // min/mile
    gapPace: number // min/mile
    elevation: number
    isWaypoint: boolean
    waypointName?: string
    cutoffMargin?: number // minutes ahead of cutoff
}

export interface ActualCheckin {
    waypointId: string
    arrivedAt: Date
}

export interface PacePlanResult {
    totalTime: number // minutes
    movingTime: number // minutes
    avgPace: number // min/mile
    avgGap: number // min/mile
    splits: Split[]
    waypointArrivals: {
        waypointId: string
        arrivalTime: number // minutes from start
        /** Minutes from start after this waypoint's planned stop. */
        departureTime?: number
        timeOfDay: string // ISO string or formatted time
        segmentMile: number // distance from prev waypoint
        segmentTime: string // formatted duration
        cutoffTime: string // numeric or formatted from WP
        segmentPace: number // raw min/mile
        overallPace: number // raw min/mile
        // name/mile let us render synthetic Start/Finish rows for races that
        // don't have those waypoints in the DB. Populated for every arrival.
        name: string
        mile: number
        synthetic?: boolean
    }[]
}

const PACE_CHART_WAYPOINT_TYPES = new Set([
    'start',
    'finish',
    'aid_station',
    'drop_bag',
    'water_only',
    'medical',
    'crew',
    'pacer',
])

export function isPaceChartWaypoint(
    waypoint: Pick<Waypoint, 'type' | 'has_drop_bag' | 'crew_allowed' | 'pacer_allowed'>
): boolean {
    return PACE_CHART_WAYPOINT_TYPES.has(waypoint.type) ||
        !!waypoint.has_drop_bag ||
        !!waypoint.crew_allowed ||
        !!waypoint.pacer_allowed
}

export function usesAidStationDefaultDelay(
    waypoint: Pick<Waypoint, 'type' | 'has_drop_bag' | 'crew_allowed' | 'pacer_allowed'>
): boolean {
    if (waypoint.type === 'start' || waypoint.type === 'finish' || waypoint.type === 'landmark') return false
    return isPaceChartWaypoint(waypoint)
}

/**
 * Minetti's energy cost formula for running (J/kg/m) based on gradient (rise/run)
 */
function getGradeFactor(gradient: number): number {
    const i = Math.max(-0.45, Math.min(0.45, gradient))
    const cost =
        155.4 * Math.pow(i, 5) -
        30.4 * Math.pow(i, 4) -
        43.3 * Math.pow(i, 3) +
        46.3 * Math.pow(i, 2) +
        19.5 * i +
        3.6
    const costFlat = 3.6
    return Math.max(0.5, cost / costFlat)
}

// Reusing an Intl.DateTimeFormat instance is ~50x faster than calling
// Date.prototype.toLocaleString with options per call (V8 rebuilds the formatter
// every time otherwise). This matters because getDynamicFactors runs per sample
// and calculatePacePlan is called three times per Drop Bag tab click.
const hourFormatterCache = new Map<string, Intl.DateTimeFormat>()
function getHourFormatter(tz: string): Intl.DateTimeFormat {
    let f = hourFormatterCache.get(tz)
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: tz })
        hourFormatterCache.set(tz, f)
    }
    return f
}

type SunCache = Map<number, { dusk: Date | null; dawn: Date | null }>

function getTerrainFactor(mile: number, terrainNodes: TerrainNode[]): number {
    // No node covers this mile yet → default "undefined" terrain (1.0).
    let activeNode: TerrainNode | null = null
    for (const node of terrainNodes) {
        if (node.mile <= mile) {
            activeNode = node
        } else {
            break
        }
    }
    if (!activeNode) return 1.0
    return (activeNode.difficulty || 100) / 100
}

function getActiveTerrainType(mile: number, terrainNodes: TerrainNode[]): string {
    let activeNode: TerrainNode | null = null
    for (const node of terrainNodes) {
        if (node.mile <= mile) activeNode = node
        else break
    }
    return (activeNode?.type || '').toLowerCase()
}

function getRunnerProfileFactor(
    mile: number,
    totalDistance: number,
    gradient: number,
    terrainType: string,
    terrainFactor: number,
    race: Partial<Race>,
    dynamic: { isNight: boolean; isHotHours: boolean; isCold: boolean },
    elevationFt: number | undefined,
    profile?: RunnerPacingProfile
): number {
    if (!profile) return 1.0
    let factor = 1.0

    if (gradient > 0.035) factor += levelAdjustment(profile.climbing, Math.min(0.08, gradient * 0.9))
    if (gradient < -0.035) factor += levelAdjustment(profile.descending, Math.min(0.07, Math.abs(gradient) * 0.8))
    if (Math.abs(gradient) <= 0.015) factor += levelAdjustment(profile.flats, 0.025)

    const technicalMagnitude = Math.min(0.08, Math.max(0, terrainFactor - 1.0) * 0.16)
    if (technicalMagnitude > 0) factor += levelAdjustment(profile.technical, technicalMagnitude)

    const terrainNotes = `${terrainType} ${race.terrain_type || ''} ${race.weather_notes || ''}`.toLowerCase()
    if (terrainNotes.includes('mud')) factor += levelAdjustment(profile.mud, 0.045)
    if (terrainNotes.includes('snow')) factor += levelAdjustment(profile.snow, 0.055)
    if (terrainNotes.includes('sand')) factor += levelAdjustment(profile.sand, 0.045)
    if (terrainNotes.includes('rock')) factor += levelAdjustment(profile.rocky, 0.04)

    if (dynamic.isNight) factor += levelAdjustment(profile.night, 0.05)
    if (dynamic.isHotHours && race.avg_temp_high && parseFloat(String(race.avg_temp_high)) > 75) {
        factor += levelAdjustment(profile.heat, 0.05)
    }
    if (dynamic.isCold) factor += levelAdjustment(profile.cold, 0.04)

    // Altitude tolerance: only meaningful above ~5000ft (matches the base altitude
    // penalty in getDynamicFactors). Strong runners give back time, weak runners
    // lose more, scaled by how high the segment is. Capped at ±6%.
    if (elevationFt !== undefined && elevationFt > 5000) {
        const altitudeMagnitude = Math.min(0.06, ((elevationFt - 5000) / 1000) * 0.01)
        if (altitudeMagnitude > 0) factor += levelAdjustment(profile.altitude, altitudeMagnitude)
    }

    if (totalDistance > 0) {
        const pct = Math.min(1.0, mile / totalDistance)
        if (profile.pacingStyle === 'fast_start') {
            // Faster early, fades late; neutral around halfway.
            factor += (pct - 0.45) * 0.12
        } else if (profile.pacingStyle === 'strong_finish') {
            // More conservative early, stronger late; neutral around halfway.
            factor += (0.55 - pct) * 0.10
        }
    }

    return Math.max(0.75, Math.min(1.35, factor))
}

function getDynamicFactors(
    mile: number,
    totalDistance: number,
    elapsedMinutes: number,
    race: Partial<Race>,
    lat?: number,
    lon?: number,
    elevationFt?: number,
    terrainFactor?: number,
    sunCache?: SunCache,
    gradient?: number,
    terrainType?: string,
    runnerProfile?: RunnerPacingProfile
): number {
    let factor = 1.0
    let isNight = false
    let isHotHours = false
    let isCold = false

    // Fatigue: quadratic ramp, +25% at the finish. The back half hurts more than the front.
    // pct^1.8 gives ~7% at halfway, ~15% at 75%, ~25% at 100%.
    if (totalDistance > 0) {
        const pct = Math.min(1.0, mile / totalDistance)
        factor += Math.pow(pct, 1.8) * 0.25
    }

    // Altitude: +1% per 1000ft above 5000ft, capped at +15%. Hypoxia only meaningful above ~5000ft.
    if (elevationFt !== undefined && elevationFt > 5000) {
        factor += Math.min(0.15, ((elevationFt - 5000) / 1000) * 0.01)
    }

    if (race && race.start_datetime) {
        const start = new Date(race.start_datetime)
        const current = new Date(start.getTime() + elapsedMinutes * 60000)

        // Hour-of-day in the race's local timezone, not the device's.
        const hour = race.timezone
            ? parseInt(getHourFormatter(race.timezone).format(current), 10)
            : current.getHours()

        // Fallback night (8 PM to 6 AM, race-local)
        isNight = hour >= 20 || hour < 6

        // Use precise twilight if we have coordinates. SunCalc output is stable per
        // calendar day, so cache by day index — a race spans at most ~2 days.
        if (lat !== undefined && lon !== undefined) {
            const dayKey = Math.floor(current.getTime() / 86400000)
            let times = sunCache?.get(dayKey)
            if (!times) {
                const t = SunCalc.getTimes(current, lat, lon)
                times = { dusk: t.dusk, dawn: t.dawn }
                sunCache?.set(dayKey, times)
            }
            if (times.dusk && times.dawn) {
                isNight = current > times.dusk || current < times.dawn
            }
        }

        // Night: base 8%, scaled up by terrain difficulty (technical trails hurt more in the dark).
        // Terrain factor clamp 1.0..1.5 → adds 0 to +7% on top of the base 8%. Max night hit: 15%.
        if (isNight) {
            const terrainMult = terrainFactor ? Math.max(1.0, terrainFactor) : 1.0
            factor += 0.08 + Math.min(0.07, (terrainMult - 1.0) * 0.15)
        }

        // Heat: continuous ramp 75°F→0% up to 95°F→+10%. Active 11am–6pm local.
        isHotHours = hour >= 11 && hour <= 18
        if (isHotHours && race.avg_temp_high) {
            const highTemp = parseFloat(race.avg_temp_high.toString())
            if (!isNaN(highTemp) && highTemp > 75) {
                factor += Math.min(0.10, ((highTemp - 75) / 20) * 0.10)
            }
        }

        // Cold: continuous ramp 40°F→0% down to 20°F→+8%. Only counts at night.
        if (isNight && race.avg_temp_low) {
            const lowTemp = parseFloat(race.avg_temp_low.toString())
            if (!isNaN(lowTemp) && lowTemp < 40) {
                isCold = true
                factor += Math.min(0.08, ((40 - lowTemp) / 20) * 0.08)
            }
        }
    }

    factor *= getRunnerProfileFactor(
        mile,
        totalDistance,
        gradient ?? 0,
        terrainType ?? '',
        terrainFactor ?? 1,
        race,
        { isNight, isHotHours, isCold },
        elevationFt,
        runnerProfile
    )

    return factor
}

export function calculatePacePlan(
    courseProfile: { distance: number; elevation: number }[], // distance in miles, elevation in ft
    totalDistance: number,
    waypoints: Waypoint[],
    terrainNodes: TerrainNode[],
    strategy: PacingStrategy,
    race: Partial<Race>,
    clock24h: boolean = false,
    actualCheckins: ActualCheckin[] = [],
    runnerProfile?: RunnerPacingProfile,
    aidStationDefaultDelay: number = 2
): PacePlanResult {
    // 1. Determine Target GAP (Moving Baseline)

    // Step 1: Calculate effort-weighted segment details
    const segmentDetails: {
        dist: number;
        gradeFactor: number;
        terrainFactor: number
        gradient: number
        terrainType: string
    }[] = []

    // Drop duplicate/non-advancing samples so segmentDetails stays in lockstep with samples.
    const samples: { distance: number; elevation: number }[] = []
    for (const s of courseProfile) {
        if (samples.length === 0 || s.distance > samples[samples.length - 1].distance) {
            samples.push(s)
        }
    }
    if (samples.length < 2) {
        return { totalTime: 0, movingTime: 0, avgPace: 0, avgGap: 0, splits: [], waypointArrivals: [] }
    }

    for (let i = 0; i < samples.length - 1; i++) {
        const p1 = samples[i]
        const p2 = samples[i + 1]
        const dist = p2.distance - p1.distance // miles, guaranteed > 0 after dedupe

        const eleChangeFt = p2.elevation - p1.elevation
        const eleChangeMeters = eleChangeFt * 0.3048
        const distMeters = dist * 1609.34

        const gradient = eleChangeMeters / distMeters
        const gradeFactor = getGradeFactor(gradient)
        const terrainFactor = getTerrainFactor(p1.distance, terrainNodes)
        const terrainType = getActiveTerrainType(p1.distance, terrainNodes)

        segmentDetails.push({
            dist,
            gradeFactor,
            terrainFactor,
            gradient,
            terrainType
        })
    }

    // Determine per-waypoint delays. These are applied when computing
    // departures, not added as a single aggregate.
    const waypointDelays: Record<string, number> = {}

    waypoints.forEach(wp => {
        let d = wp.delay
        if (d === null || d === undefined) {
            // No explicit per-waypoint override → use the race's default for aid stations.
            if (usesAidStationDefaultDelay(wp)) d = aidStationDefaultDelay
            else d = 0
        }

        if (d > 0) {
            waypointDelays[wp.id] = d
        }
    })

    const startTime = race.start_datetime ? new Date(race.start_datetime) : undefined
    const timeZone = race.timezone || undefined

    const simulateRun = (testBaseGap: number): PacePlanResult => {
        let currentElapsedTime = 0 // minutes
        let currentMovingTime = 0 // minutes
        let currentDist = 0
        let prevWaypointDist = 0
        let prevDepartureTime = 0 // wall-clock time the runner leaves the previous waypoint (arrival + its delay)
        let waypointIdx = 0
        const sortedWaypoints = [...waypoints].sort((a, b) => a.mile - b.mile)

        const waypointArrivals: PacePlanResult['waypointArrivals'] = []

        const lat = waypoints.length > 0 ? waypoints[0].lat : undefined
        const lon = waypoints.length > 0 ? waypoints[0].lon : undefined

        // Scoped per-plan-simulation caches: SunCalc and Intl formatter lookups dominate
        // the hot loop without these.
        const sunCache: SunCache = new Map()

        // We iterate through profile segments
        for (let i = 0; i < samples.length - 1; i++) {
            const detail = segmentDetails[i]

            const dynamicFactor = getDynamicFactors(
                samples[i].distance,
                totalDistance,
                currentElapsedTime,
                race,
                lat,
                lon,
                samples[i].elevation,
                detail.terrainFactor,
                sunCache,
                detail.gradient,
                detail.terrainType,
                runnerProfile
            )
            const segmentGap = testBaseGap
            const segmentPace = segmentGap * detail.gradeFactor * detail.terrainFactor * dynamicFactor
            const segmentTime = segmentPace * detail.dist
            const segmentStartDist = samples[i].distance
            const segmentEndDist = samples[i + 1].distance

            // Check for waypoints in this segment
            while (waypointIdx < sortedWaypoints.length) {
                const wp = sortedWaypoints[waypointIdx]

                // If waypoint is essentially at start (mile 0), handle it
                if (wp.mile <= 0.01 && currentDist === 0) {
                    waypointArrivals.push({
                        waypointId: wp.id,
                        arrivalTime: 0,
                        departureTime: 0,
                        timeOfDay: startTime ? formatTimeOfDay(0, startTime, timeZone, clock24h) : '00:00',
                        segmentMile: 0,
                        segmentTime: '--',
                        cutoffTime: wp.cutoff_time ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--',
                        segmentPace: 0,
                        overallPace: 0,
                        name: wp.name,
                        mile: wp.mile,
                    })
                    prevWaypointDist = wp.mile
                    prevDepartureTime = 0
                    waypointIdx++
                    continue
                }

                if (wp.mile > segmentStartDist && wp.mile <= segmentEndDist) {
                    // Interpolate arrival time
                    const distIntoSegment = wp.mile - segmentStartDist
                    const timeIntoSegment = segmentTime * (distIntoSegment / detail.dist)
                    const arrivalTime = currentElapsedTime + timeIntoSegment

                    const segmentTimeMin = arrivalTime - prevDepartureTime

                    const segDist = wp.mile - prevWaypointDist
                    const segPace = segDist > 0 ? segmentTimeMin / segDist : 0
                    const ovPace = wp.mile > 0 ? arrivalTime / wp.mile : 0
                    const delay = waypointDelays[wp.id] || 0

                    waypointArrivals.push({
                        waypointId: wp.id,
                        arrivalTime,
                        departureTime: arrivalTime + delay,
                        timeOfDay: formatTimeOfDay(arrivalTime, startTime, timeZone, clock24h),
                        segmentMile: segDist,
                        segmentTime: formatDuration(segmentTimeMin),
                        cutoffTime: wp.cutoff_time && wp.cutoff_time.length > 5 ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--',
                        segmentPace: segPace,
                        overallPace: ovPace,
                        name: wp.name,
                        mile: wp.mile,
                    })

                    prevWaypointDist = wp.mile

                    // Add delay
                    currentElapsedTime += delay
                    prevDepartureTime = arrivalTime + delay
                    waypointIdx++
                } else {
                    break
                }
            }

            currentElapsedTime += segmentTime
            currentMovingTime += segmentTime
            currentDist += detail.dist
        }

        // Handle Finish Waypoint if not caught
        while (waypointIdx < sortedWaypoints.length) {
            const wp = sortedWaypoints[waypointIdx]

            const segmentTimeMin = currentElapsedTime - prevDepartureTime

            const segDist = wp.mile - prevWaypointDist
            const segPace = segDist > 0 ? segmentTimeMin / segDist : 0
            const ovPace = wp.mile > 0 ? currentElapsedTime / wp.mile : 0

            waypointArrivals.push({
                waypointId: wp.id,
                arrivalTime: currentElapsedTime,
                departureTime: currentElapsedTime + (waypointDelays[wp.id] || 0),
                timeOfDay: formatTimeOfDay(currentElapsedTime, startTime, timeZone, clock24h),
                segmentMile: segDist,
                segmentTime: formatDuration(segmentTimeMin),
                cutoffTime: wp.cutoff_time ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--',
                segmentPace: segPace,
                overallPace: ovPace,
                name: wp.name,
                mile: wp.mile,
            })
            prevWaypointDist = wp.mile
            prevDepartureTime = currentElapsedTime
            waypointIdx++
        }

        // Synthesize Start/Finish rows if no real waypoint covers each end of the
        // course. Uses the actual sample bounds (robust when course.total_distance_miles
        // is 0, missing, or mismatched). Tolerance of 0.1mi is wide enough to collapse
        // real "Start"/"Finish" waypoints that are close but not exactly at 0/end.
        const courseStartMile = samples[0].distance
        const courseEndMile = samples[samples.length - 1].distance
        const EDGE_TOL = 0.1
        const hasStart = waypointArrivals.some(a => a.mile - courseStartMile <= EDGE_TOL)
        if (!hasStart) {
            waypointArrivals.unshift({
                waypointId: '__synthetic_start__',
                arrivalTime: 0,
                departureTime: 0,
                timeOfDay: startTime ? formatTimeOfDay(0, startTime, timeZone, clock24h) : '00:00',
                segmentMile: 0,
                segmentTime: '--',
                cutoffTime: '--',
                segmentPace: 0,
                overallPace: 0,
                name: 'Start',
                mile: courseStartMile,
                synthetic: true,
            })
        }
        const finishWaypointIds = new Set(
            sortedWaypoints.filter(wp => wp.type === 'finish').map(wp => wp.id)
        )
        const hasFinishAtEnd = waypointArrivals.some(a => courseEndMile - a.mile <= EDGE_TOL)
        const hasRealFinish = waypointArrivals.some(a => finishWaypointIds.has(a.waypointId))
        if (!hasFinishAtEnd && !hasRealFinish && courseEndMile > 0) {
            const prevMile = waypointArrivals.length > 0 ? waypointArrivals[waypointArrivals.length - 1].mile : 0
            const segDist = courseEndMile - prevMile
            const segTimeMin = currentElapsedTime - prevDepartureTime
            waypointArrivals.push({
                waypointId: '__synthetic_finish__',
                arrivalTime: currentElapsedTime,
                departureTime: currentElapsedTime,
                timeOfDay: formatTimeOfDay(currentElapsedTime, startTime, timeZone, clock24h),
                segmentMile: segDist,
                segmentTime: formatDuration(segTimeMin),
                cutoffTime: '--',
                segmentPace: segDist > 0 ? segTimeMin / segDist : 0,
                overallPace: courseEndMile > 0 ? currentElapsedTime / courseEndMile : 0,
                name: 'Finish',
                mile: courseEndMile,
                synthetic: true,
            })
        }

        // Drop synthetic finish when a real Finish waypoint exists (common when
        // finish mile is snapped off the GPX end, e.g. loop courses like BA100).
        if (hasRealFinish) {
            const synthIdx = waypointArrivals.findIndex(a => a.waypointId === '__synthetic_finish__')
            if (synthIdx !== -1) waypointArrivals.splice(synthIdx, 1)
        }

        // Collapse duplicate Finish rows — keep the real finish waypoint, or the
        // row closest to the course end if only unnamed finishes remain.
        const finishIndices = waypointArrivals
            .map((a, i) => ({ i, a }))
            .filter(({ a }) =>
                finishWaypointIds.has(a.waypointId) ||
                a.waypointId === '__synthetic_finish__' ||
                a.name.toLowerCase() === 'finish'
            )
        if (finishIndices.length > 1) {
            const keepIdx = finishIndices.find(({ a }) => finishWaypointIds.has(a.waypointId))?.i
                ?? finishIndices.reduce((best, cur) =>
                    courseEndMile - cur.a.mile < courseEndMile - best.a.mile ? cur : best
                ).i
            for (const idx of finishIndices.map(f => f.i).filter(i => i !== keepIdx).sort((a, b) => b - a)) {
                waypointArrivals.splice(idx, 1)
            }
        }

        return {
            totalTime: currentElapsedTime,
            movingTime: currentMovingTime,
            avgPace: currentMovingTime / totalDistance,
            avgGap: testBaseGap,
            splits: [],
            waypointArrivals
        }
    }

    // Solve for Base GAP using Bisection if target time is specified
    let targetTotalMinutes = 0

    if (strategy.mode === 'gap') {
        return simulateRun(strategy.value)
    } else if (strategy.mode === 'pace') {
        targetTotalMinutes = strategy.value * totalDistance
    } else {
        // mode === 'time' or 'cutoff'
        targetTotalMinutes = strategy.value
    }

    // Bisection search for the right GAP to match targetTotalMinutes
    let lowGap = 3.0 // ridiculously fast
    let highGap = 60.0 // ridiculously slow
    let bestResult = simulateRun(15.0)

    for (let attempts = 0; attempts < 15; attempts++) {
        const midGap = (lowGap + highGap) / 2
        bestResult = simulateRun(midGap)
        const diff = bestResult.totalTime - targetTotalMinutes

        if (Math.abs(diff) < 0.5) { // within 30 seconds is close enough
            break
        }

        if (bestResult.totalTime > targetTotalMinutes) {
            highGap = midGap
        } else {
            lowGap = midGap
        }
    }

    return applyActualCheckins(bestResult, actualCheckins, race, clock24h)
}

// Re-extrapolation: replace planned arrivals with actuals up through the last
// check-in, then scale the remaining (downstream) planned segments by the
// observed-vs-planned ratio at the anchor. Terrain/grade/sun weighting is
// preserved because the planned segment proportions already encode them — we
// just stretch the remaining time budget.
//
// Arrivals before the anchor without a matching check-in are linearly
// interpolated by mile between flanking actuals (or between start-time and
// the next actual).
function applyActualCheckins(
    result: PacePlanResult,
    actualCheckins: ActualCheckin[],
    race: Partial<Race>,
    clock24h: boolean
): PacePlanResult {
    if (!actualCheckins || actualCheckins.length === 0) return result
    if (!race.start_datetime) return result
    if (result.waypointArrivals.length === 0) return result

    const startTime = new Date(race.start_datetime)
    const tz = race.timezone || undefined
    const arrivalsById = new Map(result.waypointArrivals.map(a => [a.waypointId, a]))

    type Resolved = { waypointId: string; mile: number; observedElapsed: number }
    const resolved: Resolved[] = []
    for (const ck of actualCheckins) {
        const wa = arrivalsById.get(ck.waypointId)
        if (!wa) continue
        const observedElapsed = (ck.arrivedAt.getTime() - startTime.getTime()) / 60000
        if (!isFinite(observedElapsed) || observedElapsed <= 0) continue
        resolved.push({ waypointId: ck.waypointId, mile: wa.mile, observedElapsed })
    }
    if (resolved.length === 0) return result
    resolved.sort((a, b) => a.mile - b.mile)

    const anchor = resolved[resolved.length - 1]
    const anchorWa = arrivalsById.get(anchor.waypointId)
    if (!anchorWa || anchorWa.arrivalTime <= 0) return result
    const anchorPlanned = anchorWa.arrivalTime
    const paceRatio = anchor.observedElapsed / anchorPlanned

    const interpAnchors: { mile: number; elapsed: number }[] = [
        { mile: 0, elapsed: 0 },
        ...resolved.map(r => ({ mile: r.mile, elapsed: r.observedElapsed })),
    ]
    const interpElapsedAtMile = (m: number): number => {
        for (let i = 0; i < interpAnchors.length - 1; i++) {
            const a = interpAnchors[i]
            const b = interpAnchors[i + 1]
            if (m >= a.mile && m <= b.mile) {
                const t = b.mile === a.mile ? 0 : (m - a.mile) / (b.mile - a.mile)
                return a.elapsed + (b.elapsed - a.elapsed) * t
            }
        }
        return NaN
    }

    const checkinByWpId = new Map(resolved.map(r => [r.waypointId, r]))

    const remappedArrivals = result.waypointArrivals.map(wa => {
        let newElapsed: number
        const direct = checkinByWpId.get(wa.waypointId)
        if (direct) {
            newElapsed = direct.observedElapsed
        } else if (wa.mile <= anchor.mile + 0.001) {
            const interp = interpElapsedAtMile(wa.mile)
            newElapsed = isFinite(interp) ? interp : wa.arrivalTime
        } else {
            newElapsed = anchor.observedElapsed + (wa.arrivalTime - anchorPlanned) * paceRatio
        }
        const stopMinutes = Math.max(0, (wa.departureTime ?? wa.arrivalTime) - wa.arrivalTime)
        return { ...wa, arrivalTime: newElapsed, departureTime: newElapsed + stopMinutes }
    })

    let prev: typeof remappedArrivals[number] | null = null
    for (let i = 0; i < remappedArrivals.length; i++) {
        const wa = remappedArrivals[i]
        const segDist = prev ? Math.max(0, wa.mile - prev.mile) : 0
        const segTimeMin = prev ? Math.max(0, wa.arrivalTime - (prev.departureTime ?? prev.arrivalTime)) : 0
        wa.segmentMile = segDist
        wa.segmentTime = prev ? formatDuration(segTimeMin) : '--'
        wa.segmentPace = segDist > 0 ? segTimeMin / segDist : 0
        wa.overallPace = wa.mile > 0 ? wa.arrivalTime / wa.mile : 0
        wa.timeOfDay = formatTimeOfDay(wa.arrivalTime, startTime, tz, clock24h)
        prev = wa
    }

    const lastArrival = remappedArrivals[remappedArrivals.length - 1]
    const newTotal = lastArrival ? lastArrival.arrivalTime : result.totalTime
    return {
        ...result,
        waypointArrivals: remappedArrivals,
        totalTime: newTotal,
    }
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = Math.floor(minutes % 60)
    return `${h}:${m.toString().padStart(2, '0')}`
}

function formatTimeOfDay(minutesFromStart: number, startTime?: Date, timeZone?: string, clock24h: boolean = false): string {
    if (!startTime) {
        // Fix 23:60 bug by flooring instead of rounding loop elsewhere
        const h = Math.floor(minutesFromStart / 60)
        const m = Math.floor(minutesFromStart % 60)
        return `${h}:${m.toString().padStart(2, '0')}`
    }
    const d = new Date(startTime.getTime() + minutesFromStart * 60000)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h })
}
