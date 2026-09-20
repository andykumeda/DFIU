import { describe, expect, it } from 'vitest'
import type { Waypoint } from '@/types/database'
import { getRaceSupport, isVisibleBag, type SupportMode } from './race-support'

const station = (patch: Partial<Waypoint>): Waypoint => ({
    id: 'station', course_id: 'course', name: 'Station', mile: 10, order_index: 1,
    type: 'aid_station', lat: 0, lon: 0, has_drop_bag: false, crew_allowed: true,
    pacer_allowed: false, drop_bag_items: null, drop_bag_name: null, drop_bag_notes: null,
    notes: null, cutoff_time: null, elevation_ft: null, created_at: null,
    crew_relay_notes: null, runner_next_leg_notes: null, delay: null, official_source_waypoint_id: null,
    ...patch,
})

describe('race support', () => {
    it.each<[SupportMode, boolean, boolean]>([
        ['solo', false, false], ['crew', true, false], ['pacer', false, true], ['both', true, true],
    ])('%s enables the corresponding support and bag access', (mode, crew, pacer) => {
        expect(getRaceSupport({ support_mode: mode })).toEqual({ mode, crew, pacer })
        const savedCrewBag = station({ drop_bag_name: 'Supplies' })
        expect(isVisibleBag(savedCrewBag, crew, true)).toBe(crew)
        expect(isVisibleBag(savedCrewBag, crew, false)).toBe(crew)
        expect(isVisibleBag(station({ has_drop_bag: true }), crew, false)).toBe(true)
        expect(isVisibleBag(station({ type: 'start', mile: 0 }), crew, false)).toBe(true)
        expect(isVisibleBag(station({ type: 'finish' }), crew, false)).toBe(true)
    })
    it('preserves legacy support until a choice is saved', () => {
        expect(getRaceSupport(undefined)).toEqual({ mode: 'both', crew: true, pacer: true })
    })
    it('keeps unsaved crew bag candidates editor-only, and retains saved data when hidden', () => {
        const candidate = station({})
        expect(isVisibleBag(candidate, true, true)).toBe(true)
        expect(isVisibleBag(candidate, true, false)).toBe(false)
        const saved = station({ drop_bag_name: 'Extra socks', drop_bag_items: [{ text: 'Socks', checked: true }] })
        const before = structuredClone(saved)
        expect(isVisibleBag(saved, false, true)).toBe(false)
        expect(saved).toEqual(before)
        expect(isVisibleBag(saved, true, false)).toBe(true)
    })
})
