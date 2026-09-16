import { describe, expect, it } from 'vitest'
import { formatWaypointCutoffFields, isValidHtmlTimeValue } from './waypoint-cutoff-fields'

const part = (type: Intl.DateTimeFormatPartTypes, value: string): Intl.DateTimeFormatPart => ({ type, value })

describe('formatWaypointCutoffFields', () => {
    it('accepts only values supported by an HTML time input', () => {
        expect(isValidHtmlTimeValue('00:00')).toBe(true)
        expect(isValidHtmlTimeValue('23:59')).toBe(true)
        expect(isValidHtmlTimeValue('24:00')).toBe(false)
    })

    it('normalizes Safari midnight hour 24 for an HTML time input', () => {
        const fields = formatWaypointCutoffFields(
            '2026-09-20T07:00:00.000Z',
            'America/Los_Angeles',
            () => [
                part('year', '2026'),
                part('month', '09'),
                part('day', '20'),
                part('hour', '24'),
                part('minute', '00'),
            ],
        )

        expect(fields).toEqual({ date: '2026-09-20', time: '00:00' })
    })

    it('returns blank fields for an invalid stored cutoff', () => {
        expect(formatWaypointCutoffFields('not-a-date', 'America/Los_Angeles')).toEqual({ date: '', time: '' })
    })

    it('does not pass another out-of-range hour to an HTML time input', () => {
        const fields = formatWaypointCutoffFields(
            '2026-09-20T07:00:00.000Z',
            'America/Los_Angeles',
            () => [
                part('year', '2026'),
                part('month', '09'),
                part('day', '20'),
                part('hour', '25'),
                part('minute', '00'),
            ],
        )

        expect(fields).toEqual({ date: '2026-09-20', time: '' })
    })
})
