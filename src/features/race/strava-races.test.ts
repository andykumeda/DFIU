import { describe, expect, it } from 'vitest'
import {
  equivalentPaceForRace,
  isStravaRaceActivity,
  shouldDefaultSelectStravaRace,
  stravaRaceToHistoryDraft,
  summarizeStravaRace,
} from './strava-races'

const raceRun = {
  id: 11,
  name: 'Boston Marathon',
  sport_type: 'Run',
  workout_type: 1,
  distance: 42195,
  moving_time: 11100,
  elapsed_time: 11220,
  total_elevation_gain: 250,
  start_date_local: '2025-04-21T10:00:00Z',
}

describe('isStravaRaceActivity', () => {
  it('keeps tagged running races', () => {
    expect(isStravaRaceActivity(raceRun)).toBe(true)
    expect(isStravaRaceActivity({ ...raceRun, sport_type: 'TrailRun' })).toBe(true)
    expect(isStravaRaceActivity({ ...raceRun, sport_type: undefined, type: 'VirtualRun' })).toBe(true)
  })

  it('rejects rides, workouts, and untagged runs', () => {
    expect(isStravaRaceActivity({ ...raceRun, sport_type: 'Ride' })).toBe(false)
    expect(isStravaRaceActivity({ ...raceRun, workout_type: 0 })).toBe(false)
    expect(isStravaRaceActivity({ ...raceRun, workout_type: 3 })).toBe(false)
    expect(isStravaRaceActivity({ ...raceRun, workout_type: null })).toBe(false)
  })
})

describe('summarizeStravaRace / stravaRaceToHistoryDraft', () => {
  it('maps meters and seconds into history fields', () => {
    const summary = summarizeStravaRace(raceRun)
    expect(summary).toMatchObject({
      id: 11,
      name: 'Boston Marathon',
      sportType: 'Run',
      distanceMeters: 42195,
      movingSeconds: 11100,
    })
    const draft = stravaRaceToHistoryDraft(summary!)
    expect(draft?.racedAt).toBe('2025-04-21')
    expect(draft?.distanceMi).toBeCloseTo(26.2188, 3)
    expect(draft?.movingMinutes).toBe(185)
    expect(draft?.finishMinutes).toBe(187)
    expect(draft?.elevationGainFt).toBe(820)
    expect(equivalentPaceForRace(draft!)).toBeGreaterThan(6)
    expect(equivalentPaceForRace(draft!)).toBeLessThan(8)
  })

  it('returns null for non-races', () => {
    expect(summarizeStravaRace({ ...raceRun, workout_type: 2 })).toBeNull()
  })
})

describe('shouldDefaultSelectStravaRace', () => {
  it('selects marathons and trail races, but not short road races', () => {
    const marathon = summarizeStravaRace(raceRun)!
    const trailHalf = summarizeStravaRace({
      ...raceRun,
      id: 12,
      sport_type: 'TrailRun',
      distance: 21000,
    })!
    const fiveK = summarizeStravaRace({
      ...raceRun,
      id: 13,
      distance: 5000,
    })!
    const tenMileRoad = summarizeStravaRace({
      ...raceRun,
      id: 14,
      distance: 16093,
    })!

    expect(shouldDefaultSelectStravaRace(marathon)).toBe(true)
    expect(shouldDefaultSelectStravaRace(trailHalf)).toBe(true)
    expect(shouldDefaultSelectStravaRace(fiveK)).toBe(false)
    expect(shouldDefaultSelectStravaRace(tenMileRoad)).toBe(false)
  })
})
