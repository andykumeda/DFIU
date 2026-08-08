import { describe, expect, it } from 'vitest'
import { predictPace } from './pace-prediction'

const course = [
  { distance: 0, elevation: 1000 },
  { distance: 5, elevation: 1000 },
]

describe('predictPace', () => {
  it('uses a runner baseline to produce a finish estimate and uncertainty interval', () => {
    const result = predictPace({
      courseProfile: course,
      totalDistance: 5,
      terrainNodes: [],
      waypoints: [],
      race: {},
      baselineFlatPace: 10,
    })

    expect(result.p50TotalMinutes).toBe(50)
    expect(result.p10TotalMinutes).toBeLessThan(result.p50TotalMinutes)
    expect(result.p90TotalMinutes).toBeGreaterThan(result.p50TotalMinutes)
    expect(result.confidence).toBe('low')
  })

  it('uses recent comparable history to calibrate the baseline and tighten uncertainty', () => {
    const base = predictPace({ courseProfile: course, totalDistance: 5, terrainNodes: [], waypoints: [], race: {}, baselineFlatPace: 10 })
    const calibrated = predictPace({
      courseProfile: course,
      totalDistance: 5,
      terrainNodes: [],
      waypoints: [],
      race: {},
      baselineFlatPace: 10,
      history: [{ distanceMi: 10, elevationGainFt: 0, finishMinutes: 80, racedAt: '2026-07-15' }],
      now: new Date('2026-08-04T00:00:00Z'),
    })

    expect(calibrated.p50MovingMinutes).toBeLessThan(base.p50MovingMinutes)
    expect(calibrated.p90TotalMinutes - calibrated.p10TotalMinutes).toBeLessThan(base.p90TotalMinutes - base.p10TotalMinutes)
    expect(calibrated.confidence).toBe('medium')
  })

  it('makes technical night descents costlier than the same route in daylight', () => {
    const descent = [{ distance: 0, elevation: 5000 }, { distance: 2, elevation: 3000 }]
    const daylight = predictPace({ courseProfile: descent, totalDistance: 2, terrainNodes: [{ mile: 0, difficulty: 130, type: 'technical' }], waypoints: [], race: {}, baselineFlatPace: 10 })
    const night = predictPace({
      courseProfile: descent,
      totalDistance: 2,
      terrainNodes: [{ mile: 0, difficulty: 130, type: 'technical' }],
      waypoints: [],
      race: { start_datetime: '2026-08-04T22:00:00Z', timezone: 'UTC' },
      baselineFlatPace: 10,
    })

    expect(night.p50MovingMinutes).toBeGreaterThan(daylight.p50MovingMinutes)
  })
})
