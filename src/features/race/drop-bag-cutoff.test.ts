import { describe, expect, it } from 'vitest'
import { formatBagCutoff } from './drop-bag-cutoff'

describe('bag cutoff display', () => {
    it('formats timestamps in the race timezone', () => {
        expect(formatBagCutoff('2026-10-03T21:00:00Z', 'America/Los_Angeles', true)).toBe('14:00')
    })
    it('preserves legacy local clocks and honors 12-hour preference', () => {
        expect(formatBagCutoff('14:30', 'America/Los_Angeles', false)).toBe('02:30 PM')
        expect(formatBagCutoff('00:15:00', null, true)).toBe('00:15')
    })
    it('omits missing or invalid cutoffs', () => {
        expect(formatBagCutoff(null, null, true)).toBeNull()
        expect(formatBagCutoff('invalid', null, true)).toBeNull()
    })
})
