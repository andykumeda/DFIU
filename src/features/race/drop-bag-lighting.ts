import SunCalc from 'suncalc'

export const LIGHTING_DELAY_MINUTES = 60
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const SUNSET_ALTITUDE = -0.833 * Math.PI / 180

type Location = { lat: number; lon: number }
export type BagLighting = {
    status: 'planned-darkness' | 'delay-darkness' | 'daylight' | 'unavailable'
    needsLight: boolean
}

function validLocation(point: Location): boolean {
    return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
        Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180 &&
        !(point.lat === 0 && point.lon === 0) // Unset waypoint coordinates in this app.
}

/** Sunset, not civil dusk: also catches dawn starts, overnight/multi-day legs and polar night. */
function includesDarkness(start: number, end: number, point: Location): boolean {
    const belowSunset = (time: number) => SunCalc.getPosition(new Date(time), point.lat, point.lon).altitude <= SUNSET_ALTITUDE
    if (belowSunset(start) || belowSunset(end)) return true
    // Both endpoints may be daylight on different days. Check every intervening sunset.
    const firstDay = Math.floor(start / DAY) * DAY - DAY
    for (let day = firstDay; day <= end + DAY; day += DAY) {
        const sunset = SunCalc.getTimes(new Date(day + DAY / 2), point.lat, point.lon).sunset.getTime()
        if (Number.isFinite(sunset) && sunset >= start && sunset <= end) return true
    }
    return false
}

/** Cover the entire leg until the next available bag (or finish), including late running.
 * Use both endpoint locations conservatively; terrain shade/weather are not modeled.
 * All calculations use absolute instants, independent of the viewer's timezone.
 */
export function getBagLighting(input: {
    startDatetime: string | null
    arrivalMinutes: number | undefined
    nextArrivalMinutes: number | undefined
    from: Location
    to: Location
    delayMinutes?: number
}): BagLighting {
    const { startDatetime, arrivalMinutes, nextArrivalMinutes, from, to, delayMinutes = LIGHTING_DELAY_MINUTES } = input
    const raceStart = startDatetime ? Date.parse(startDatetime) : NaN
    if (!Number.isFinite(raceStart) || arrivalMinutes === undefined || nextArrivalMinutes === undefined ||
        !Number.isFinite(arrivalMinutes) || !Number.isFinite(nextArrivalMinutes) || arrivalMinutes < 0 ||
        nextArrivalMinutes < arrivalMinutes || !Number.isFinite(delayMinutes) || delayMinutes < 0 ||
        !validLocation(from) || !validLocation(to)) {
        return { status: 'unavailable', needsLight: false }
    }
    const start = raceStart + arrivalMinutes * MINUTE
    const end = raceStart + nextArrivalMinutes * MINUTE
    if ([from, to].some(point => includesDarkness(start, end, point))) {
        return { status: 'planned-darkness', needsLight: true }
    }
    if ([from, to].some(point => includesDarkness(start, end + delayMinutes * MINUTE, point))) {
        return { status: 'delay-darkness', needsLight: true }
    }
    return { status: 'daylight', needsLight: false }
}

export function getBagLightingMessage(lighting: BagLighting, nextBagName: string): string | null {
    if (lighting.status === 'unavailable') return 'Lighting check unavailable: calculate Plan A and confirm the race start and bag locations. Carry a backup light.'
    if (!lighting.needsLight) return null
    const reason = lighting.status === 'planned-darkness'
        ? 'This leg includes sunset or darkness on Plan A.'
        : `A ${LIGHTING_DELAY_MINUTES}-minute delay could put this leg after sunset.`
    return `Carry a headlamp and backup light from here to ${nextBagName}. ${reason}`
}
