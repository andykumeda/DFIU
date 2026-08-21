import { getCoordinateAtDistance } from '@/lib/geo-utils'
import type { Course, Race } from '@/types/database'
import type { PacePlanResult } from './pace-utils'

export type DateTimeDraft = { date: string; time: string }

export function getCourseCoordinates(course: Course | null | undefined): [number, number][] {
    const geometry = course?.geometry as { type?: string; coordinates?: [number, number][]; geometry?: { type?: string; coordinates?: [number, number][] } } | null | undefined
    if (!geometry) return []
    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) return geometry.coordinates
    if (geometry.type === 'Feature' && geometry.geometry?.type === 'LineString' && Array.isArray(geometry.geometry.coordinates)) {
        return geometry.geometry.coordinates
    }
    return []
}

export function getElapsedMinutes(race: Pick<Race, 'start_datetime'> | null | undefined, nowMs: number): number {
    if (!race?.start_datetime) return 0
    return (nowMs - new Date(race.start_datetime).getTime()) / 60000
}

export function getPredictedMile(plan: PacePlanResult | null | undefined, elapsedMin: number): number {
    if (!plan || elapsedMin <= 0) return 0
    const arrivals = plan.waypointArrivals
    if (arrivals.length === 0) return 0
    if (elapsedMin >= arrivals[arrivals.length - 1].arrivalTime) return arrivals[arrivals.length - 1].mile

    for (let i = 0; i < arrivals.length - 1; i += 1) {
        const a = arrivals[i]
        const b = arrivals[i + 1]
        if (elapsedMin >= a.arrivalTime && elapsedMin <= b.arrivalTime) {
            const span = b.arrivalTime - a.arrivalTime
            const t = span <= 0 ? 0 : (elapsedMin - a.arrivalTime) / span
            return a.mile + t * (b.mile - a.mile)
        }
    }
    return 0
}

/** Inverse of getPredictedMile: elapsed minutes from start at a course mile. */
export function getElapsedMinutesAtMile(plan: PacePlanResult | null | undefined, mile: number): number | null {
    if (!plan) return null
    const arrivals = plan.waypointArrivals
    if (arrivals.length === 0) return null
    if (!Number.isFinite(mile)) return null

    if (mile <= arrivals[0].mile) return arrivals[0].arrivalTime
    const last = arrivals[arrivals.length - 1]
    if (mile >= last.mile) return last.arrivalTime

    for (let i = 0; i < arrivals.length - 1; i += 1) {
        const a = arrivals[i]
        const b = arrivals[i + 1]
        if (mile >= a.mile && mile <= b.mile) {
            const span = b.mile - a.mile
            const t = span <= 0 ? 0 : (mile - a.mile) / span
            return a.arrivalTime + t * (b.arrivalTime - a.arrivalTime)
        }
    }
    return null
}

/** Departure time at an exact waypoint; otherwise the interpolated arrival time. */
export function getDepartureMinutesAtMile(plan: PacePlanResult | null | undefined, mile: number): number | null {
    if (!plan || !Number.isFinite(mile)) return null
    const waypoint = plan.waypointArrivals.find(arrival => Math.abs(arrival.mile - mile) < 0.01)
    if (waypoint && Number.isFinite(waypoint.departureTime)) return waypoint.departureTime!
    return getElapsedMinutesAtMile(plan, mile)
}

export function formatPaceMinPerMile(minPerMile: number): string {
    if (!Number.isFinite(minPerMile) || minPerMile <= 0) return '--'
    let m = Math.floor(minPerMile)
    let s = Math.round((minPerMile % 1) * 60)
    if (s === 60) {
        s = 0
        m += 1
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatRaceClockTime(
    minutesFromStart: number,
    race: Pick<Race, 'start_datetime' | 'timezone'> | null | undefined,
    clock24h = false
): string | null {
    if (!race?.start_datetime || !Number.isFinite(minutesFromStart)) return null
    const start = new Date(race.start_datetime)
    if (Number.isNaN(start.getTime())) return null
    const d = new Date(start.getTime() + minutesFromStart * 60000)
    return d.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: race.timezone || undefined,
        hour12: !clock24h,
    })
}

export type OverlapRacePace = {
    paceMinPerMile: number
    paceLabel: string
    durationMin: number
    enterTimeOfDay: string | null
    exitTimeOfDay: string | null
}

/** Plan A predicted pace and clock window for a course-mile overlap span. */
export function getOverlapRacePace(
    plan: PacePlanResult | null | undefined,
    courseStartMi: number,
    courseEndMi: number,
    race: Pick<Race, 'start_datetime' | 'timezone'> | null | undefined,
    clock24h = false
): OverlapRacePace | null {
    if (!plan) return null
    const start = Math.min(courseStartMi, courseEndMi)
    const end = Math.max(courseStartMi, courseEndMi)
    const span = end - start
    if (!(span > 0)) return null

    const t0 = getDepartureMinutesAtMile(plan, start)
    const t1 = getElapsedMinutesAtMile(plan, end)
    if (t0 == null || t1 == null) return null

    const durationMin = Math.abs(t1 - t0)
    if (!(durationMin > 0)) return null

    const paceMinPerMile = durationMin / span
    const enterElapsed = Math.min(t0, t1)
    const exitElapsed = Math.max(t0, t1)

    return {
        paceMinPerMile,
        paceLabel: formatPaceMinPerMile(paceMinPerMile),
        durationMin,
        enterTimeOfDay: formatRaceClockTime(enterElapsed, race, clock24h),
        exitTimeOfDay: formatRaceClockTime(exitElapsed, race, clock24h),
    }
}

export function getRunnerLatLonAtMile(course: Course | null | undefined, mile: number): [number, number] | null {
    if (!course?.geometry) return null
    const totalMiles = course.total_distance_miles ?? 0
    const boundedMile = Math.max(0, totalMiles > 0 ? Math.min(totalMiles, mile) : mile)
    return getCoordinateAtDistance(course.geometry as unknown as GeoJSON.LineString, boundedMile * 1609.34) as [number, number] | null
}

export function getRunnerMapFocus(totalMiles: number | null | undefined, predictedMile: number, windowMiles = 4) {
    const total = totalMiles ?? 0
    if (total <= 0) return null
    const center = Math.max(0, Math.min(total, predictedMile))
    const half = Math.max(0.75, windowMiles / 2)
    let startMile = Math.max(0, center - half)
    let endMile = Math.min(total, center + half)

    if (endMile - startMile < Math.min(windowMiles, total)) {
        if (startMile === 0) endMile = Math.min(total, windowMiles)
        else if (endMile === total) startMile = Math.max(0, total - windowMiles)
    }

    return { startMile, endMile }
}

export function formatHM(min: number): string {
    if (!Number.isFinite(min)) return '--'
    const sign = min < 0 ? '-' : ''
    const value = Math.abs(min)
    const h = Math.floor(value / 60)
    const m = Math.floor(value % 60)
    return `${sign}${h}:${m.toString().padStart(2, '0')}`
}

export function parseDurationToMinutes(value: string): number | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const match = trimmed.match(/^(\d{1,3})(?::([0-5]\d))?$/)
    if (!match) return null
    const hours = Number(match[1])
    const minutes = match[2] ? Number(match[2]) : 0
    const total = hours * 60 + minutes
    return Number.isFinite(total) && total > 0 ? total : null
}

export function formatDurationInput(minutes: number | null | undefined): string {
    if (!minutes || !Number.isFinite(minutes)) return ''
    const h = Math.floor(minutes / 60)
    const m = Math.floor(minutes % 60)
    return `${h}:${m.toString().padStart(2, '0')}`
}

export function toLocalDateTimeDraft(value?: Date | string | null): DateTimeDraft {
    const d = value ? new Date(value) : new Date()
    if (Number.isNaN(d.getTime())) return { date: '', time: '' }
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
}

export function parseLocalDateTimeDraft(draft: DateTimeDraft): Date | null {
    if (!draft.date || !draft.time) return null
    const d = new Date(`${draft.date}T${draft.time}`)
    return Number.isNaN(d.getTime()) ? null : d
}
