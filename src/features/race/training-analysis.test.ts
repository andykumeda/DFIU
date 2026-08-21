import { describe, expect, it } from 'vitest'
import type { PacePlanResult } from './pace-utils'
import {
  buildTrainingPlanSummary,
  getTrainingAnalysisDelta,
  getOverlappingMovingMinutes,
  getTrainingSegmentMovingMinutes,
  isSameTrainingOverlap,
} from './training-analysis'

function makePlan(
  arrivals: Array<{ mile: number; arrivalTime: number }>
): PacePlanResult {
  const totalTime = arrivals.length > 0 ? arrivals[arrivals.length - 1].arrivalTime : 0
  return {
    totalTime,
    movingTime: totalTime,
    avgPace: 0,
    avgGap: 0,
    splits: [],
    waypointArrivals: arrivals.map((arrival, index) => ({
      waypointId: `wp-${index}`,
      arrivalTime: arrival.arrivalTime,
      timeOfDay: '',
      segmentMile: 0,
      segmentTime: '',
      cutoffTime: '',
      segmentPace: 0,
      overallPace: 0,
      name: `WP ${index}`,
      mile: arrival.mile,
    })),
  }
}

describe('buildTrainingPlanSummary', () => {
  it('splits a continuous overlap into official aid-to-aid sections', () => {
    const summary = buildTrainingPlanSummary(
      [{ courseStartMi: 11.3, courseEndMi: 42.6, trainingStartMi: 0, trainingEndMi: 31.3 }],
      makePlan([
        { mile: 11.3, arrivalTime: 60 },
        { mile: 18.2, arrivalTime: 120 },
        { mile: 25.1, arrivalTime: 180 },
        { mile: 33.4, arrivalTime: 260 },
        { mile: 42.6, arrivalTime: 350 },
      ]),
      { start_datetime: '2026-08-01T00:00:00.000Z', timezone: 'UTC' },
      false,
      [
        { name: 'Clear Creek', mile: 11.3, type: 'aid_station' },
        { name: 'Josephine Peak', mile: 18.2, type: 'aid_station' },
        { name: 'Red Box', mile: 25.1, type: 'aid_station' },
        { name: 'Newcomb', mile: 33.4, type: 'aid_station' },
        { name: 'Shortcut', mile: 42.6, type: 'aid_station' },
        { name: 'Scenic point', mile: 28, type: 'landmark' },
      ]
    )

    expect(summary?.segments).toHaveLength(4)
    expect(summary?.segments.map(segment => segment.sectionLabel)).toEqual([
      'Clear Creek → Josephine Peak',
      'Josephine Peak → Red Box',
      'Red Box → Newcomb',
      'Newcomb → Shortcut',
    ])
    expect(summary?.segments.map(segment => segment.courseMilesLabel)).toEqual([
      '11.3–18.2',
      '18.2–25.1',
      '25.1–33.4',
      '33.4–42.6',
    ])
    expect(summary?.trainingMilesTotal).toBeCloseTo(31.3)
    expect(summary?.raceMilesTotal).toBeCloseTo(31.3)
  })

  it('sums every overlapping race segment for the Plan A goal', () => {
    const summary = buildTrainingPlanSummary(
      [
        { courseStartMi: 78.7, courseEndMi: 84.8, trainingStartMi: 0, trainingEndMi: 6.1 },
        { courseStartMi: 74.8, courseEndMi: 78.6, trainingStartMi: 10, trainingEndMi: 14 },
      ],
      makePlan([
        { mile: 74.8, arrivalTime: 190 },
        { mile: 78.7, arrivalTime: 221 },
        { mile: 84.8, arrivalTime: 421 },
      ]),
      { start_datetime: '2026-08-01T00:00:00.000Z', timezone: 'UTC' },
      false
    )

    expect(summary).not.toBeNull()
    expect(summary!.raceMilesLabel).toBe('74.8–78.6, 78.7–84.8')
    expect(summary!.raceMilesTotal).toBeCloseTo(9.9, 4)
    expect(summary!.raceDurationLabel).toBe('3 hours 50 mins')
    expect(summary!.trainingMilesLabel).toBe('10–14, 0–6.1')
    expect(summary!.trainingMilesTotal).toBeCloseTo(10.1, 4)
    expect(summary!.segments).toEqual([
      expect.objectContaining({ courseMilesLabel: '74.8–78.6', trainingMilesLabel: '10–14', raceDurationLabel: '30 mins' }),
      expect.objectContaining({ courseMilesLabel: '78.7–84.8', trainingMilesLabel: '0–6.1', raceDurationLabel: '3 hours 20 mins' }),
    ])
  })

  it('orders race segments by course mile', () => {
    const summary = buildTrainingPlanSummary(
      [
        { courseStartMi: 72.7, courseEndMi: 87.3, trainingStartMi: 20, trainingEndMi: 35 },
        { courseStartMi: 25.0, courseEndMi: 24.6, trainingStartMi: 8, trainingEndMi: 8.4 },
        { courseStartMi: 24.6, courseEndMi: 33, trainingStartMi: 0, trainingEndMi: 8.4 },
      ],
      null,
      { start_datetime: null, timezone: null },
      false
    )

    expect(summary!.raceMilesLabel).toBe('24.6–33, 72.7–87.3')
    expect(summary!.segments.map(s => s.courseMilesLabel)).toEqual(['24.6–33', '25–24.6', '72.7–87.3'])
  })

  it('does not promote a tiny GPS proximity fragment at an aid station into a route-plan section', () => {
    const summary = buildTrainingPlanSummary(
      [
        { courseStartMi: 0.4, courseEndMi: 10.5, trainingStartMi: 0.4, trainingEndMi: 10.4 },
        { courseStartMi: 24.6, courseEndMi: 24.8, trainingStartMi: 14.4, trainingEndMi: 14.6 },
      ],
      null,
      { start_datetime: null, timezone: null },
      false,
      [{ name: 'Redbox', mile: 24.7, type: 'aid_station' }]
    )

    expect(summary?.segments.map(segment => segment.courseMilesLabel)).toEqual(['0.4–10.5'])
    expect(summary?.segments.map(segment => segment.sectionLabel)).not.toContain('Redbox → Redbox')
    expect(summary?.raceMilesTotal).toBeCloseTo(10.1)
  })

  it('does not double-count reverse then forward on the same course miles', () => {
    // Sam Merrill to Finish shape: reverse 95.64→90.44 then forward 90.44→100.85.
    const summary = buildTrainingPlanSummary(
      [
        { courseStartMi: 95.64, courseEndMi: 90.44, trainingStartMi: 1.68, trainingEndMi: 6.79 },
        { courseStartMi: 90.44, courseEndMi: 100.85, trainingStartMi: 6.79, trainingEndMi: 16.73 },
      ],
      null,
      { start_datetime: null, timezone: null },
      false
    )

    expect(summary!.raceMilesTotal).toBeCloseTo(10.41, 4)
    expect(summary!.raceMilesLabel).toBe('90.4–100.8')
    expect(summary!.trainingMilesTotal).toBeCloseTo(15.05, 4)
  })
})

describe('getTrainingAnalysisDelta', () => {
  it('reports elapsed training time relative to the Plan A segment goal', () => {
    const delta = getTrainingAnalysisDelta(240, 200)

    expect(delta.deltaMinutes).toBe(40)
    expect(delta.label).toBe('40 mins slower than Plan A')
    expect(delta.tone).toBe('slower')
  })
})

describe('getOverlappingMovingMinutes', () => {
  it('uses moving time and excludes non-overlapping training miles', () => {
    expect(getOverlappingMovingMinutes(120 * 60, 20, 5)).toBe(30)
  })
})

describe('getTrainingSegmentMovingMinutes', () => {
  it('keeps non-consecutive training portions separate using Strava moving stream data', () => {
    const activity = {
      movingSeconds: 9999,
      distanceMiles: 15,
      stream: {
        distanceMeters: [0, 1609.344, 2 * 1609.344, 10 * 1609.344, 11 * 1609.344, 12 * 1609.344, 14 * 1609.344, 15 * 1609.344],
        elapsedSeconds: [0, 600, 1200, 4200, 4800, 5400, 6000, 6600],
        moving: [true, true, true, false, true, true, true, true],
      },
    }

    expect(getTrainingSegmentMovingMinutes(activity.movingSeconds, activity.distanceMiles, { trainingStartMi: 0, trainingEndMi: 2 }, activity.stream)).toBeCloseTo(20)
    expect(getTrainingSegmentMovingMinutes(activity.movingSeconds, activity.distanceMiles, { trainingStartMi: 10, trainingEndMi: 14 }, activity.stream)).toBeCloseTo(30)
  })
})

describe('isSameTrainingOverlap', () => {
  it('matches training mile ranges within a small tolerance', () => {
    expect(isSameTrainingOverlap({ trainingStartMi: 10, trainingEndMi: 14 }, { trainingStartMi: 10.02, trainingEndMi: 14.01 })).toBe(true)
    expect(isSameTrainingOverlap({ trainingStartMi: 10, trainingEndMi: 14 }, { trainingStartMi: 0, trainingEndMi: 6 })).toBe(false)
    expect(isSameTrainingOverlap(null, { trainingStartMi: 10, trainingEndMi: 14 })).toBe(false)
  })
})
