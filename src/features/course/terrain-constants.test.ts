import { describe, expect, it } from 'vitest'
import { TERRAIN_TYPES, normalizeTerrainType, canMergeTerrainNodes, getTerrainLabel, getTerrainDefaultDifficulty } from './terrain-constants'

describe('three trail classifications', () => {
    it('offers three trail options alongside paved and other', () => {
        expect(TERRAIN_TYPES.map(t => t.label)).toEqual(['Paved', 'Non-technical', 'Somewhat technical', 'Very technical', 'Other'])
        expect(getTerrainDefaultDifficulty('technical')).toBe(118)
    })
    it('maps all retired values into selectable classifications', () => {
        for (const type of ['runnable_trail', 'double_track', 'single_track']) {
            expect(normalizeTerrainType(type)).toBe('technical')
            expect(getTerrainLabel(type)).toBe('Somewhat technical')
        }
        expect(normalizeTerrainType('smooth_dirt_gravel')).toBe('dirt')
        expect(getTerrainLabel('dirt')).toBe('Non-technical')
        expect(getTerrainLabel('highly_technical')).toBe('Very technical')
    })
    it('keeps distinct pacing adjustments separate after category consolidation', () => {
        expect(canMergeTerrainNodes({ type: 'runnable_trail', difficulty: 110 }, { type: 'technical', difficulty: 118 })).toBe(false)
        expect(canMergeTerrainNodes({ type: 'runnable_trail', difficulty: 110 }, { type: 'technical', difficulty: 110 })).toBe(true)
        expect(canMergeTerrainNodes({ type: 'dirt', difficulty: 110 }, { type: 'technical', difficulty: 110 })).toBe(false)
    })
})
