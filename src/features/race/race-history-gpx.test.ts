import { describe, expect, it } from 'vitest'
import type { GpxParseResult } from '@/lib/gpx-parser'
import { parseFinishTimeInput, raceDraftFromGpx } from './race-history-gpx'

function parsed(overrides: Partial<GpxParseResult> = {}): GpxParseResult {
  return {
    name: 'Western States',
    tracks: [{
      name: 'WS100',
      points: [
        { lat: 39.1, lon: -120.9, ele: 1000, time: '2025-06-28T05:00:00Z' },
        { lat: 39.2, lon: -120.8, ele: 1100, time: '2025-06-28T08:00:00Z' },
        { lat: 39.3, lon: -120.7, ele: 900, time: '2025-06-29T03:00:00Z' },
      ],
    }],
    bounds: { minLat: 39, maxLat: 40, minLon: -121, maxLon: -120 },
    stats: {
      totalDistanceMiles: 100.2,
      totalElevationGainFt: 18000,
      totalElevationLossFt: 18000,
      minElevationFt: 500,
      maxElevationFt: 8700,
    },
    coordinates: [],
    elevationProfile: [],
    waypoints: [],
    ...overrides,
  }
}

describe('raceDraftFromGpx', () => {
  it('reads name, distance, gain, and elapsed time from timestamps', () => {
    const draft = raceDraftFromGpx(parsed(), 'ignored.gpx')
    expect(draft.raceName).toBe('Western States')
    expect(draft.distanceMi).toBe(100.2)
    expect(draft.elevationGainFt).toBe(18000)
    expect(draft.racedAt).toBe('2025-06-28')
    expect(draft.hasTimestamps).toBe(true)
    expect(draft.finishMinutes).toBe(22 * 60)
    expect(draft.movingMinutes).toBe(22 * 60)
  })

  it('uses first-to-last timestamp as finish time', () => {
    const draft = raceDraftFromGpx(parsed({
      tracks: [{
        name: null,
        points: [
          { lat: 1, lon: 1, ele: 0, time: '2025-01-01T08:00:00Z' },
          { lat: 1, lon: 1, ele: 0, time: '2025-01-01T08:30:00Z' },
          { lat: 1, lon: 1, ele: 0, time: '2025-01-01T10:30:00Z' },
        ],
      }],
    }), 'loop.gpx')
    expect(draft.finishMinutes).toBe(150)
    expect(draft.movingMinutes).toBe(150)
  })

  it('falls back to the file name when the GPX has no name or times', () => {
    const draft = raceDraftFromGpx(parsed({
      name: null,
      tracks: [{ name: null, points: [{ lat: 1, lon: 1, ele: 0 }, { lat: 1.1, lon: 1.1, ele: 10 }] }],
    }), 'path/to/Leona Divide.gpx')
    expect(draft.raceName).toBe('Leona Divide')
    expect(draft.hasTimestamps).toBe(false)
    expect(draft.finishMinutes).toBeNull()
  })
})

describe('parseFinishTimeInput', () => {
  it('accepts HH:MM and raw minutes', () => {
    expect(parseFinishTimeInput('18:30')).toBe(1110)
    expect(parseFinishTimeInput('720')).toBe(720)
    expect(parseFinishTimeInput('')).toBeNull()
  })
})
