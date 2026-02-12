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
        cutoffDelta: number | null // minutes ahead/behind
    }[]
}

/**
 * Minetti's energy cost formula for running (J/kg/m) based on gradient (rise/run)
 * C(i) = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6
 * 
 * We use the ratio C(i) / C(0) to determine the pace adjustment.
 * GAP = ActualPace * (Cost / CostFlat)
 * ActualPace = GAP / (Cost / CostFlat) -> ActualPace = GAP * (CostFlat / Cost)
 * Wait. Higher cost = Slower speed = Higher Pace number.
 * If Cost is 2x Flat, Pace should be 2x slower (e.g. 10min/mi -> 20min/mi).
 * So ActualPace = GAP * (Cost / CostFlat)
 */
function getGradeFactor(gradient: number): number {
    // Clamp gradient to reasonable limits (-0.45 to 0.45) to avoid extreme polynomials
    const i = Math.max(-0.45, Math.min(0.45, gradient))

    const cost =
        155.4 * Math.pow(i, 5) -
        30.4 * Math.pow(i, 4) -
        43.3 * Math.pow(i, 3) +
        46.3 * Math.pow(i, 2) +
        19.5 * i +
        3.6

    const costFlat = 3.6

    // Factor = Cost / CostFlat
    // e.g., if Cost is 7.2, Factor is 2.0.
    // ActualPace = GAP * 2.0. (10:00 -> 20:00)
    return Math.max(0.5, cost / costFlat) // Enforce min factor (downhill limit)
}

function getTerrainFactor(mile: number, terrainNodes: TerrainNode[]): number {
    if (terrainNodes.length === 0) return 1.0

    // Find the latest node that is <= current mile
    // Assuming nodes are sorted by mile
    // Node defines the segment STARTING at its mile.
    // Wait, typical usage: Node at Mile 0 defines start. Node at Mile 10 defines change.
    // So for mile 5, we look for node with max mile <= 5.

    let activeNode = terrainNodes[0]

    // If first node starts after 0, assume default (1.0) until then? 
    // Or assume it covers from 0? Let's assume 0-indexed coverage if possible, or search.

    for (const node of terrainNodes) {
        if (node.mile <= mile) {
            activeNode = node
        } else {
            break
        }
    }

    // Difficulty is percentage: 100 = 1.0, 120 = 1.2
    return (activeNode.difficulty || 100) / 100
}

export function calculatePacePlan(
    courseProfile: { distance: number; elevation: number }[], // distance in miles, elevation in ft
    totalDistance: number,
    waypoints: Waypoint[],
    terrainNodes: TerrainNode[],
    strategy: PacingStrategy,
    delays: { default: number;[waypointId: string]: number },
    startTime?: Date
): PacePlanResult {
    // 1. Determine Target GAP (Moving Baseline)
    // If strategy is GAP, easy.
    // If strategy is Time or AvgPace, we need to solve for GAP.
    // Since delays affect Time strategy (Total Time), needed:
    // MovingTime = TotalTime - TotalDelays.
    // Then solve GAP.
    // Since GAP -> ActualPace varies by terrain, we can't just divide by distance.
    // We calculate the "Total Weighted Distance" or "Effort Miles" then divide MovingTime by that?
    // WeightedMile = RealMile * GradeFactor * TerrainFactor.
    // MovingTime = GAP * Sum(WeightedMiles).
    // So GAP = MovingTime / Sum(WeightedMiles).

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
        // Fallback if no profile
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
    // We assume every aid station (or typed waypoint) gets a delay?
    // Using `delays` object which should be keyed by Waypoint ID.
    // Default delay applies if not specified? 
    // Wait, the input said "option for aid station delays".
    // Let's iterate waypoints and sum delays.
    let totalDelaysMin = 0
    const waypointDelays: Record<string, number> = {}

    waypoints.forEach(wp => {
        // Only apply delays to Aid Stations or similar?
        // User might want delays at Crew/Water too.
        // Let's verify type.
        if (['aid_station', 'water_only', 'crew', 'drop_bag'].includes(wp.type)) {
            const d = delays[wp.id] !== undefined ? delays[wp.id] : delays.default
            if (d > 0) {
                waypointDelays[wp.id] = d
                totalDelaysMin += d
            }
        }
    })

    // Solve for Base GAP
    let baseGap = 0 // min/mile

    if (strategy.mode === 'gap') {
        baseGap = strategy.value
    } else if (strategy.mode === 'pace') {
        // Avg Overall Pace input? Or Avg Moving Pace?
        // Usually "Average Pace" target implies Overall.
        // TotalTime = Pace * TotalDistance
        // MovingTime = TotalTime - Delays
        // GAP = MovingTime / EffortMiles
        // IF value is minutes/mile:
        const totalTime = strategy.value * totalDistance
        const movingTime = Math.max(0, totalTime - totalDelaysMin)
        baseGap = movingTime / totalEffortMiles
    } else if (strategy.mode === 'time') {
        // Target Time (minutes)
        const totalTime = strategy.value
        const movingTime = Math.max(0, totalTime - totalDelaysMin)
        baseGap = movingTime / totalEffortMiles
    }

    // 2. Generate Splits
    let currentElapsedTime = 0 // minutes
    let currentMovingTime = 0 // minutes
    let currentDist = 0
    let waypointIdx = 0
    const sortedWaypoints = [...waypoints].sort((a, b) => a.mile - b.mile)

    const waypointArrivals: PacePlanResult['waypointArrivals'] = []

    // To create splits, let's output one entry per profile segment? Or per mile?
    // "Splits" usually means per mile.
    // Let's generate a full trace, then aggregate into 1-mile splits for display?
    // Or just return the waypoints.
    // The requirement said "Table: Waypoint Name...". So primarily Waypoints.

    // We iterate through profile segments
    for (let i = 0; i < samples.length - 1; i++) {
        const detail = segmentDetails[i]
        const segmentGap = baseGap // For now constant effort. Real implementation might vary effort by duration (fatigue).

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
                    timeOfDay: startTime ? new Date(startTime.getTime()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00',
                    cutoffDelta: getCutoffDelta(0, wp.cutoff_time, startTime)
                })
                waypointIdx++
                continue
            }

            if (wp.mile > segmentStartDist && wp.mile <= segmentEndDist) {
                // Interpolate arrival time
                const distIntoSegment = wp.mile - segmentStartDist
                const timeIntoSegment = segmentTime * (distIntoSegment / detail.dist)

                const arrivalTime = currentElapsedTime + timeIntoSegment

                // Calculate Cutoff Delta
                const delta = getCutoffDelta(arrivalTime, wp.cutoff_time, startTime)

                waypointArrivals.push({
                    waypointId: wp.id,
                    arrivalTime,
                    timeOfDay: formatTimeOfDay(arrivalTime, startTime),
                    cutoffDelta: delta
                })

                // Add delay
                const delay = waypointDelays[wp.id] || 0
                currentElapsedTime += delay // Delay adds to elapsed, but not moving

                waypointIdx++
            } else {
                break
            }
        }

        currentElapsedTime += segmentTime
        currentMovingTime += segmentTime
        currentDist += detail.dist
    }

    // Handle Finish Waypoint if not caught (e.g. exactly at end)
    while (waypointIdx < sortedWaypoints.length) {
        const wp = sortedWaypoints[waypointIdx]
        waypointArrivals.push({
            waypointId: wp.id,
            arrivalTime: currentElapsedTime,
            timeOfDay: formatTimeOfDay(currentElapsedTime, startTime),
            cutoffDelta: getCutoffDelta(currentElapsedTime, wp.cutoff_time, startTime)
        })
        waypointIdx++
    }

    return {
        totalTime: currentElapsedTime,
        movingTime: currentMovingTime,
        avgPace: currentMovingTime / totalDistance, // Avg Moving Pace
        avgGap: baseGap,
        splits: [], // Todo: generate mile splits if needed
        waypointArrivals
    }
}

function getCutoffDelta(arrivalTimeMin: number, cutoffIso: string | null, stratStartTime?: Date): number | null {
    if (!cutoffIso || !stratStartTime) return null

    const cutoffDate = new Date(cutoffIso)
    const arrivalDate = new Date(stratStartTime.getTime() + arrivalTimeMin * 60000)

    // Difference in minutes
    const diffMs = cutoffDate.getTime() - arrivalDate.getTime()
    return diffMs / 60000
}

function formatTimeOfDay(minutesFromStart: number, startTime?: Date): string {
    if (!startTime) {
        const h = Math.floor(minutesFromStart / 60)
        const m = Math.floor(minutesFromStart % 60)
        return `${h}:${m.toString().padStart(2, '0')}`
    }
    const d = new Date(startTime.getTime() + minutesFromStart * 60000)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
