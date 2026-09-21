import { describe, expect, it } from 'vitest'
import SunCalc from 'suncalc'
import { getBagLighting } from './drop-bag-lighting'
import { getDropBagEditorItems } from './drop-bag-shared'

const location = { lat: 34.32, lon: -118.01 }
const start = '2026-10-03T05:00:00-07:00'
const input = { startDatetime: start, from: location, to: location }
const elapsed = (date: Date) => (date.getTime() - Date.parse(start)) / 60_000
const sun = SunCalc.getTimes(new Date('2026-10-03T19:00:00Z'), location.lat, location.lon)

describe('bag-to-bag lighting coverage', () => {
    it('recommends picking up at Chilao 1 before the leg to Chilao 2 crosses sunset', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: 12 * 60 + 28, nextArrivalMinutes: 14 * 60 + 46 }).status).toBe('planned-darkness')
    })
    it('treats civil twilight before dusk as needing a light', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: elapsed(sun.sunset) - 30, nextArrivalMinutes: elapsed(sun.sunset) + 5, delayMinutes: 0 }).needsLight).toBe(true)
    })
    it('flags the previous pickup even when the planned leg ends before sunset but a delay crosses it', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: elapsed(sun.sunset) - 150, nextArrivalMinutes: elapsed(sun.sunset) - 30 }).status).toBe('delay-darkness')
    })
    it('does not add lighting for a fully daylight leg including its allowance', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: 6 * 60, nextArrivalMinutes: 8 * 60 }).status).toBe('daylight')
    })
    it('includes a pre-dawn start and a leg ending after sunrise', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: 0, nextArrivalMinutes: 3 * 60 }).needsLight).toBe(true)
    })
    it('checks the night between daylight endpoints on different days', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: 6 * 60, nextArrivalMinutes: 30 * 60 }).needsLight).toBe(true)
    })
    it('reports unavailable for missing plans, invalid coordinates or reversed times', () => {
        expect(getBagLighting({ ...input, arrivalMinutes: undefined, nextArrivalMinutes: 800 }).status).toBe('unavailable')
        expect(getBagLighting({ ...input, from: { lat: 0, lon: 0 }, arrivalMinutes: 100, nextArrivalMinutes: 200 }).status).toBe('unavailable')
        expect(getBagLighting({ ...input, arrivalMinutes: 200, nextArrivalMinutes: 100 }).status).toBe('unavailable')
    })
    it('preserves packed smart gear and quantities when a changed plan no longer suggests it', () => {
        const packed = { id: 'smart_night_2', category: 'conditions', text: 'Backup Batteries/Light', checked: true, quantity: '2' }
        expect(getDropBagEditorItems([packed], [], { isNight: false, isHot: false, isCold: false })).toContainEqual(packed)
    })
})
