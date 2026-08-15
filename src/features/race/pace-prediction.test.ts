import { describe, expect, it } from 'vitest'
import { historyDistanceSimilarity, predictPace } from './pace-prediction'

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

  it('gives a 50K less influence than a 100-mile finish when predicting a 100-mile race', () => {
    const hundred = [
      { distance: 0, elevation: 1000 },
      { distance: 100, elevation: 1000 },
    ]
    const racedAt = '2026-07-15'
    const now = new Date('2026-08-04T00:00:00Z')
    const from50k = predictPace({
      courseProfile: hundred,
      totalDistance: 100,
      terrainNodes: [],
      waypoints: [],
      race: {},
      baselineFlatPace: 15,
      history: [{ distanceMi: 31, elevationGainFt: 0, finishMinutes: 31 * 8, racedAt }],
      now,
    })
    const from100 = predictPace({
      courseProfile: hundred,
      totalDistance: 100,
      terrainNodes: [],
      waypoints: [],
      race: {},
      baselineFlatPace: 15,
      history: [{ distanceMi: 100, elevationGainFt: 0, finishMinutes: 100 * 8, racedAt }],
      now,
    })

    expect(from50k.p50MovingMinutes).toBeGreaterThan(from100.p50MovingMinutes)
    expect(from50k.p50MovingMinutes).toBeLessThan(15 * 100)
  })
})

describe('historyDistanceSimilarity', () => {
  it('scales 50K / 50 mile / 100K down for a 100-mile target', () => {
    expect(historyDistanceSimilarity(31, 100)).toBeCloseTo(0.31)
    expect(historyDistanceSimilarity(50, 100)).toBeCloseTo(0.5)
    expect(historyDistanceSimilarity(62, 100)).toBeCloseTo(0.62)
    expect(historyDistanceSimilarity(100, 100)).toBe(1)
    expect(historyDistanceSimilarity(120, 100)).toBe(1)
  })
})
