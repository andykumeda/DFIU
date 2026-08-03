import { describe, expect, it } from 'vitest'
import type { PacePlanResult } from './pace-utils'
import {
  formatPaceMinPerMile,
  getElapsedMinutesAtMile,
  getOverlapRacePace,
} from './race-day-utils'

function makePlan(arrivals: { mile: number; arrivalTime: number }[]): PacePlanResult {
  return {
    splits: [],
    totalTime: arrivals[arrivals.length - 1]?.arrivalTime ?? 0,
    movingTime: arrivals[arrivals.length - 1]?.arrivalTime ?? 0,
    avgPace: 10,
    avgGap: 10,
    waypointArrivals: arrivals.map((a, i) => ({
      waypointId: `wp-${i}`,
      mile: a.mile,
      name: `WP ${i}`,
      arrivalTime: a.arrivalTime,
      timeOfDay: '--',
      segmentMile: i === 0 ? 0 : a.mile - arrivals[i - 1].mile,
      segmentTime: '--',
      segmentPace: 10,
      overallPace: a.mile > 0 ? a.arrivalTime / a.mile : 0,
      cutoffTime: '--',
    })),
  }
}

describe('getElapsedMinutesAtMile', () => {
  const plan = makePlan([
    { mile: 0, arrivalTime: 0 },
    { mile: 10, arrivalTime: 100 },
    { mile: 20, arrivalTime: 220 },
  ])

  it('returns endpoints and midpoints', () => {
    expect(getElapsedMinutesAtMile(plan, 0)).toBe(0)
    expect(getElapsedMinutesAtMile(plan, 10)).toBe(100)
    expect(getElapsedMinutesAtMile(plan, 5)).toBe(50)
    expect(getElapsedMinutesAtMile(plan, 15)).toBe(160)
  })

  it('clamps outside the plan range', () => {
    expect(getElapsedMinutesAtMile(plan, -1)).toBe(0)
    expect(getElapsedMinutesAtMile(plan, 25)).toBe(220)
  })

  it('returns null without arrivals', () => {
    expect(getElapsedMinutesAtMile(makePlan([]), 5)).toBeNull()
    expect(getElapsedMinutesAtMile(null, 5)).toBeNull()
  })
})

describe('getOverlapRacePace', () => {
  const plan = makePlan([
    { mile: 0, arrivalTime: 0 },
    { mile: 10, arrivalTime: 100 },
    { mile: 20, arrivalTime: 220 },
  ])

  it('computes pace over an overlap span', () => {
    // mi 10–20 → 120 min / 10 mi = 12:00/mi
    const mid = getOverlapRacePace(plan, 10, 20, null, false)
    expect(mid).not.toBeNull()
    expect(mid!.paceMinPerMile).toBeCloseTo(12, 5)
    expect(mid!.paceLabel).toBe('12:00')
    expect(mid!.durationMin).toBe(120)
    expect(mid!.enterTimeOfDay).toBeNull()
    expect(mid!.exitTimeOfDay).toBeNull()
  })

  it('formats clock times when race start is set', () => {
    const race = {
      start_datetime: '2026-08-01T06:00:00.000Z',
      timezone: 'UTC',
    }
    const result = getOverlapRacePace(plan, 0, 10, race, true)
    expect(result).not.toBeNull()
    expect(result!.paceLabel).toBe('10:00')
    expect(result!.enterTimeOfDay).toMatch(/6:00/)
    expect(result!.exitTimeOfDay).toMatch(/7:40/)
  })

  it('returns null for zero-length span', () => {
    expect(getOverlapRacePace(plan, 5, 5, null)).toBeNull()
  })
})

describe('formatPaceMinPerMile', () => {
  it('formats minutes:seconds', () => {
    expect(formatPaceMinPerMile(12.5)).toBe('12:30')
    expect(formatPaceMinPerMile(0)).toBe('--')
  })
})
