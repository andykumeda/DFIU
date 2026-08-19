import { describe, expect, it } from 'vitest'
import {
  coordinateAtTrainingMile,
  formatTrainingMapHover,
  hoverMilesAtPoint,
  raceMileForTrainingMile,
} from './training-map-hover'

describe('coordinateAtTrainingMile', () => {
  it('returns the corresponding route coordinate for an elevation-profile mile', () => {
    const training: [number, number][] = [
      [-118.0, 34.0],
      [-118.0, 34.02],
    ]

    expect(coordinateAtTrainingMile(0, training)).toEqual(training[0])
    const middle = coordinateAtTrainingMile(0.5, training)
    expect(middle).not.toBeNull()
    expect(middle![0]).toBeCloseTo(-118, 5)
    expect(middle![1]).toBeGreaterThan(34)
    expect(middle![1]).toBeLessThan(34.02)
  })
})

describe('raceMileForTrainingMile', () => {
  it('interpolates race miles along a forward overlap', () => {
    expect(
      raceMileForTrainingMile(14.41, [
        { trainingStartMi: 11.44, trainingEndMi: 17.38, courseStartMi: 27.67, courseEndMi: 33.04 },
      ])
    ).toBeCloseTo(30.355, 2)
  })

  it('interpolates reverse training against course miles', () => {
    expect(
      raceMileForTrainingMile(3, [
        { trainingStartMi: 0, trainingEndMi: 6, courseStartMi: 90, courseEndMi: 84 },
      ])
    ).toBeCloseTo(87, 4)
  })
})

describe('formatTrainingMapHover', () => {
  it('matches the map overlay copy', () => {
    expect(formatTrainingMapHover(29.4, 13.2)).toBe('Race: Mile 29.4 | Training: Mile 13.2')
    expect(formatTrainingMapHover(null, 2.5)).toBe('Training: Mile 2.5')
  })
})

describe('hoverMilesAtPoint', () => {
  it('snaps to the training line and maps overlap to race miles', () => {
    const training: [number, number][] = [
      [-118.0, 34.0],
      [-118.0, 34.01],
      [-118.0, 34.02],
    ]
    const hover = hoverMilesAtPoint(-118.0, 34.01, training, [
      { trainingStartMi: 0, trainingEndMi: 1.4, courseStartMi: 10, courseEndMi: 20 },
    ])
    expect(hover).not.toBeNull()
    expect(hover!.trainingMile).toBeGreaterThan(0)
    expect(hover!.raceMile).toBeGreaterThan(10)
  })
})
