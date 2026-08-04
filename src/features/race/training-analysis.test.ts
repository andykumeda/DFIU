import { describe, expect, it } from 'vitest'
import type { PacePlanResult } from './pace-utils'
import {
  buildTrainingPlanSummary,
  getTrainingAnalysisDelta,
  getOverlappingMovingMinutes,
  getTrainingSegmentMovingMinutes,
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
    expect(summary!.raceMilesLabel).toBe('78.7–84.8, 74.8–78.6')
    expect(summary!.raceMilesTotal).toBeCloseTo(9.9, 4)
    expect(summary!.raceDurationLabel).toBe('3 hours 50 mins')
    expect(summary!.trainingMilesLabel).toBe('0–6.1, 10–14')
    expect(summary!.trainingMilesTotal).toBeCloseTo(10.1, 4)
    expect(summary!.segments).toEqual([
      expect.objectContaining({ courseMilesLabel: '78.7–84.8', trainingMilesLabel: '0–6.1', raceDurationLabel: '3 hours 20 mins' }),
      expect.objectContaining({ courseMilesLabel: '74.8–78.6', trainingMilesLabel: '10–14', raceDurationLabel: '30 mins' }),
    ])
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
