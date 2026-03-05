
import { TerrainNode, Waypoint, Race } from '@/types/database'

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
        segmentPace: number // raw min/mile
        overallPace: number // raw min/mile
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

function getDynamicFactors(
    mile: number,
    totalDistance: number,
    elapsedMinutes: number,
    race: Partial<Race>
): number {
    let factor = 1.0

    // Fatigue: linearly add up to +15% by the end of the race
    if (totalDistance > 0) {
        const fatigue = (mile / totalDistance) * 0.15
        factor += fatigue
    }

    if (race && race.start_datetime) {
        const start = new Date(race.start_datetime)
        const current = new Date(start.getTime() + elapsedMinutes * 60000)
        const hour = current.getHours()

        // Time of Day (Nighttime factor)
        // Assume nighttime is between 20:00 (8 PM) and 6:00 (6 AM)
        const isNight = hour >= 20 || hour < 6
        if (isNight) {
            factor += 0.10 // 10% slower at night
        }

        // Temperature Factor
        // Hot hours: 12 PM (12:00) to 4 PM (16:00)
        const isHotHours = hour >= 12 && hour <= 16
        if (isHotHours && race.avg_temp_high) {
            const highTemp = parseInt(race.avg_temp_high.toString())
            if (!isNaN(highTemp) && highTemp >= 80) {
                factor += 0.05 // 5% slower in peak heat if temp >= 80F
            }
        }

        // Cold Night Factor
        if (isNight && race.avg_temp_low) {
            const lowTemp = parseInt(race.avg_temp_low.toString())
            if (!isNaN(lowTemp) && lowTemp <= 35) {
                factor += 0.05 // extra 5% slower if night is freezing/cold
            }
        }
    }

    return factor
}

export function calculatePacePlan(
    courseProfile: { distance: number; elevation: number }[], // distance in miles, elevation in ft
    totalDistance: number,
    waypoints: Waypoint[],
    terrainNodes: TerrainNode[],
    strategy: PacingStrategy,
    race: Partial<Race>,
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

    const startTime = race.start_datetime ? new Date(race.start_datetime) : undefined
    const timeZone = race.timezone || undefined

    const simulateRun = (testBaseGap: number): PacePlanResult => {
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

            const dynamicFactor = getDynamicFactors(samples[i].distance, totalDistance, currentElapsedTime, race)
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
                        timeOfDay: startTime ? formatTimeOfDay(0, startTime, timeZone, clock24h) : '00:00',
                        segmentMile: 0,
                        segmentTime: '--',
                        cutoffTime: wp.cutoff_time ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--',
                        segmentPace: 0,
                        overallPace: 0
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

                    const prevArrival = waypointArrivals.length > 0 ? waypointArrivals[waypointArrivals.length - 1].arrivalTime : 0
                    const segmentTimeMin = arrivalTime - prevArrival

                    const segDist = wp.mile - prevWaypointDist
                    const segPace = segDist > 0 ? segmentTimeMin / segDist : 0
                    const ovPace = wp.mile > 0 ? arrivalTime / wp.mile : 0

                    waypointArrivals.push({
                        waypointId: wp.id,
                        arrivalTime,
                        timeOfDay: formatTimeOfDay(arrivalTime, startTime, timeZone, clock24h),
                        segmentMile: segDist,
                        segmentTime: formatDuration(segmentTimeMin),
                        cutoffTime: wp.cutoff_time && wp.cutoff_time.length > 5 ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--',
                        segmentPace: segPace,
                        overallPace: ovPace
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

            const segDist = wp.mile - prevWaypointDist
            const segPace = segDist > 0 ? segmentTimeMin / segDist : 0
            const ovPace = wp.mile > 0 ? currentElapsedTime / wp.mile : 0

            waypointArrivals.push({
                waypointId: wp.id,
                arrivalTime: currentElapsedTime,
                timeOfDay: formatTimeOfDay(currentElapsedTime, startTime, timeZone, clock24h),
                segmentMile: segDist,
                segmentTime: formatDuration(segmentTimeMin),
                cutoffTime: wp.cutoff_time ? new Date(wp.cutoff_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone, hour12: !clock24h }) : '--',
                segmentPace: segPace,
                overallPace: ovPace
            })
            prevWaypointDist = wp.mile
            waypointIdx++
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

    return bestResult
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
