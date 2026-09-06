import { describe, expect, it } from 'vitest'
import { equivalentFlatPace, historyDistanceSimilarity, predictPace } from './pace-prediction'

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
      history: [{ distanceMi: 5, elevationGainFt: 0, finishMinutes: 40, racedAt: '2026-07-15' }],
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

  it('uses observed pace without pulling sparse history toward an arbitrary default', () => {
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

    expect(from50k.p50MovingMinutes).toBeCloseTo(from100.p50MovingMinutes)
    expect(from50k.p50MovingMinutes).toBeLessThan(15 * 100)
  })
})

describe('historyDistanceSimilarity', () => {
  it('scales 50K / 50 mile / 100K down for a 100-mile target', () => {
    expect(historyDistanceSimilarity(31, 100)).toBeCloseTo(0.31 ** 2)
    expect(historyDistanceSimilarity(50, 100)).toBeCloseTo(0.5 ** 2)
    expect(historyDistanceSimilarity(62, 100)).toBeCloseTo(0.62 ** 2)
    expect(historyDistanceSimilarity(100, 100)).toBe(1)
    expect(historyDistanceSimilarity(120, 100)).toBeCloseTo((100 / 120) ** 2)
  })
})


describe('history calibration regressions', () => {
  const now = new Date('2026-09-06T12:00:00Z')
  const input = { courseProfile: course, totalDistance: 5, terrainNodes: [], waypoints: [], race: {}, now }

  it('normalizes ascent consistently and reproduces a comparable past moving time', () => {
    // Low rolling hills avoid altitude effects while accumulating 20,000 ft.
    const hills = Array.from({ length: 201 }, (_, i) => ({ distance: i / 2, elevation: i % 2 ? 200 : 0 }))
    const comparable = predictPace({ ...input, totalDistance: 100, courseProfile: hills,
      history: [{ distanceMi: 100, elevationGainFt: 20000, movingMinutes: 1600, finishMinutes: 1700 }],
    })
    expect(comparable.p50MovingMinutes).toBeCloseTo(1600, 4)
    expect(equivalentFlatPace(100, 1600, 20000)).toBeCloseTo(1600 / (100 + 20000 / 528))
  })

  it('downweights both very short and multi-day races', () => {
    expect(historyDistanceSimilarity(150, 100)).toBeCloseTo((100 / 150) ** 2)
    expect(historyDistanceSimilarity(5, 100)).toBeCloseTo(0.0025)
    const base = { ...input, totalDistance: 100, courseProfile: [{ distance: 0, elevation: 0 }, { distance: 100, elevation: 0 }] }
    const result = predictPace({ ...base, history: [
      { distanceMi: 100, finishMinutes: 1000 },
      { distanceMi: 150, finishMinutes: 3000 },
    ] })
    expect(result.calibratedFlatPace).toBeLessThan(14)
  })

  it('does not tighten disagreement into high confidence just by adding more finishes', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({ distanceMi: 5, finishMinutes: i % 2 ? 100 : 50, racedAt: '2026-09-01' }))
    const result = predictPace({ ...input, history })
    expect(result.confidence).toBe('medium')
    expect(result.p90TotalMinutes / result.p50TotalMinutes).toBeGreaterThan(1.3)
  })

  it('ignores invalid moving time, elevation, and dates without poisoning valid history', () => {
    const valid = { distanceMi: 5, finishMinutes: 50, racedAt: '2026-09-01' }
    const result = predictPace({ ...input, history: [valid,
      { ...valid, movingMinutes: 0 }, { ...valid, movingMinutes: 60 },
      { ...valid, elevationGainFt: NaN }, { ...valid, racedAt: 'bad-date' },
    ] })
    expect(result.p50MovingMinutes).toBeCloseTo(50)
    expect(predictPace({ ...input, history: [{ ...valid, movingMinutes: -1 }] }).confidence).toBe('low')
  })
})


it('excludes 200+ mile finishes only for sub-200-mile predictions, without deleting history', () => {
  const history = [{ distanceMi: 100, finishMinutes: 1000 }, { distanceMi: 257, finishMinutes: 5000 }]
  const result = predictPace({ courseProfile: course, totalDistance: 100, terrainNodes: [], waypoints: [], race: {}, history })
  expect(result.calibratedFlatPace).toBeCloseTo(10)
  expect(result.excludedLongRaceCount).toBe(1)
  expect(history).toHaveLength(2)
  expect(historyDistanceSimilarity(200, 100)).toBe(0)
  expect(historyDistanceSimilarity(200, 200)).toBe(1)
  expect(historyDistanceSimilarity(257, 250)).toBeGreaterThan(0.9)
})
