
import { TerrainNode, Waypoint } from '@/types/database'

export interface PacingStrategy {
    mode: 'time' | 'pace' | 'gap'
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

export interface PacePlanResult {
    totalTime: number // minutes
    movingTime: number // minutes
    avgPace: number // min/mile
    avgGap: number // min/mile
    splits: Split[]
    waypointArrivals: {
        waypointId: string
        arrivalTime: number // minutes from start
        timeOfDay: string // ISO string or formatted time
        segmentMile: number // distance from prev waypoint
        segmentTime: string // formatted duration
        cutoffTime: string // numeric or formatted from WP
    }[]
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

function getTerrainFactor(mile: number, terrainNodes: TerrainNode[]): number {
    if (terrainNodes.length === 0) return 1.0
    let activeNode = terrainNodes[0]
    for (const node of terrainNodes) {
        if (node.mile <= mile) {
            activeNode = node
        } else {
            break
        }
    }
    return (activeNode.difficulty || 100) / 100
}

export function calculatePacePlan(
    courseProfile: { distance: number; elevation: number }[], // distance in miles, elevation in ft
    totalDistance: number,
    waypoints: Waypoint[],
    terrainNodes: TerrainNode[],
    strategy: PacingStrategy,
    startTime?: Date,
    timeZone?: string,
    clock24h: boolean = false
): PacePlanResult {
    // 1. Determine Target GAP (Moving Baseline)

    // Step 1: Calculate Total Weights (Effort Factor sum)
    let totalEffortMiles = 0
    const segmentDetails: {
        dist: number;
        gradeFactor: number;
        terrainFactor: number
    }[] = []

    // Ensure profile covers the full distance
    const samples = [...courseProfile]
    if (samples.length < 2) {
        return { totalTime: 0, movingTime: 0, avgPace: 0, avgGap: 0, splits: [], waypointArrivals: [] }
    }

    for (let i = 0; i < samples.length - 1; i++) {
        const p1 = samples[i]
        const p2 = samples[i + 1]
        const dist = p2.distance - p1.distance // miles
        if (dist <= 0) continue

        const eleChangeFt = p2.elevation - p1.elevation
        const eleChangeMeters = eleChangeFt * 0.3048
        const distMeters = dist * 1609.34

        const gradient = eleChangeMeters / distMeters
        const gradeFactor = getGradeFactor(gradient)
        const terrainFactor = getTerrainFactor(p1.distance, terrainNodes)

        const effortMiles = dist * gradeFactor * terrainFactor
        totalEffortMiles += effortMiles

        segmentDetails.push({
            dist,
            gradeFactor,
            terrainFactor
        })
    }

    // Determine Total Delays
    // Iterate waypoints and sum delays from wp.delay property
    let totalDelaysMin = 0
    const waypointDelays: Record<string, number> = {}

    waypoints.forEach(wp => {
        let d = wp.delay
        if (d === null || d === undefined) {
            // Default 2 minutes for aid stations if not specified
            if (wp.type === 'aid_station') d = 2
            else d = 0
        }

        if (d > 0) {
            waypointDelays[wp.id] = d
            totalDelaysMin += d
        }
    })

    // Solve for Base GAP
    let baseGap = 0 // min/mile

    if (strategy.mode === 'gap') {
        baseGap = strategy.value
    } else if (strategy.mode === 'pace') {
        const totalTime = strategy.value * totalDistance
        const movingTime = Math.max(0, totalTime - totalDelaysMin)
        baseGap = movingTime / totalEffortMiles
    } else if (strategy.mode === 'time') {
        const totalTime = strategy.value
        const movingTime = Math.max(0, totalTime - totalDelaysMin)
        baseGap = movingTime / totalEffortMiles
    }

    // 2. Generate Trace and Waypoint Arrivals
    let currentElapsedTime = 0 // minutes
    let currentMovingTime = 0 // minutes
    let currentDist = 0
    let prevWaypointDist = 0
    let waypointIdx = 0
    const sortedWaypoints = [...waypoints].sort((a, b) => a.mile - b.mile)

    const waypointArrivals: PacePlanResult['waypointArrivals'] = []

    // We iterate through profile segments
    for (let i = 0; i < samples.length - 1; i++) {
        const detail = segmentDetails[i]

        const segmentGap = baseGap
        const segmentPace = segmentGap * detail.gradeFactor * detail.terrainFactor
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
                    timeOfDay: startTime ? formatTimeOfDay(0, startTime, timeZone, clock24h) : '00:00',
                    segmentMile: 0,
                    segmentTime: '--',
                    cutoffTime: wp.cutoff_time ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--'
                })
                prevWaypointDist = wp.mile
                waypointIdx++
                continue
            }

            if (wp.mile > segmentStartDist && wp.mile <= segmentEndDist) {
                // Interpolate arrival time
                const distIntoSegment = wp.mile - segmentStartDist
                const timeIntoSegment = segmentTime * (distIntoSegment / detail.dist)
                const arrivalTime = currentElapsedTime + timeIntoSegment

                // Segment calculations
                const segmentMile = wp.mile - prevWaypointDist
                // Segment Time: difference between this arrival and previous arrival
                // Note: previous arrival time includes cumulative delays up to that point.
                // Current arrival time excludes the delay for THIS waypoint (added after).
                // So (Current Arrival - Prev Arrival) = Travel Time + Prev Wp Delay?
                // Wait. 
                // arrivalTime is calculated from `currentElapsedTime` which includes ALL previous delays.
                // It does NOT include current waypoint delay yet.
                // The previous waypoint arrival time also included all delays prior to IT.
                // But if the previous waypoint had a delay, that delay was added to `currentElapsedTime` AFTER the arrival was pushed.
                // So `currentElapsedTime` entering this segment INCLUDES the delay from the previous waypoint.
                // Therefore (arrivalTime - prevArrival) includes the previous waypoint's delay.
                // This is correct for "Elapsed time between departures" approx?
                // Actually usually "Segment Time" means "Time spent moving/traveling on this segment".
                // If we want moving time:
                // We'd need to subtract the previous delay?
                // Let's stick to elapsed time diff for now, or just travel time.
                // The prompt asked for "Segment Time". 
                // Let's use (Arrival - Prev Arrival).

                const prevArrival = waypointArrivals.length > 0 ? waypointArrivals[waypointArrivals.length - 1].arrivalTime : 0
                // Note: If previous waypoint had a delay, it is INCLUDED in `currentElapsedTime` so `arrivalTime` reflects it.
                // `prevArrival` was the time of arrival AT that waypoint (before delay).
                // So (Arrival - Prev Arrival) = (Travel Time + Prev Delay).
                // If we want pure travel time, we should track pure moving time?
                // For simplicity let's use the difference in arrival times which represents the "wall clock" time passed.

                const segmentTimeMin = arrivalTime - prevArrival

                waypointArrivals.push({
                    waypointId: wp.id,
                    arrivalTime,
                    timeOfDay: formatTimeOfDay(arrivalTime, startTime, timeZone, clock24h),
                    segmentMile: segmentMile,
                    segmentTime: formatDuration(segmentTimeMin),
                    cutoffTime: wp.cutoff_time && wp.cutoff_time.length > 5 ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--'
                })

                prevWaypointDist = wp.mile

                // Add delay
                const delay = waypointDelays[wp.id] || 0
                currentElapsedTime += delay
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

        const prevArrival = waypointArrivals.length > 0 ? waypointArrivals[waypointArrivals.length - 1].arrivalTime : 0
        const segmentTimeMin = currentElapsedTime - prevArrival
        // Note: currentElapsedTime here includes the travel time of the last segment (and all prev delays).

        waypointArrivals.push({
            waypointId: wp.id,
            arrivalTime: currentElapsedTime,
            timeOfDay: formatTimeOfDay(currentElapsedTime, startTime, timeZone, clock24h),
            segmentMile: wp.mile - prevWaypointDist,
            segmentTime: formatDuration(segmentTimeMin),
            cutoffTime: wp.cutoff_time ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--'
        })
        prevWaypointDist = wp.mile
        waypointIdx++
    }

    return {
        totalTime: currentElapsedTime,
        movingTime: currentMovingTime,
        avgPace: currentMovingTime / totalDistance,
        avgGap: baseGap,
        splits: [],
        waypointArrivals
    }
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = Math.floor(minutes % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}`
    return `${m}m`
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
