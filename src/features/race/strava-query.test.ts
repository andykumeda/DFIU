import { describe, expect, it } from 'vitest'
import { formatDistanceMiles, formatMovingTime, normalizeStravaQuery } from './strava-query'

describe('Strava query presentation helpers', () => {
  it('normalizes whitespace without changing the question', () => {
    expect(normalizeStravaQuery('  recent   runs   this month ')).toBe('recent runs this month')
  })

  it('formats optional activity metrics safely', () => {
    expect(formatDistanceMiles(12.345)).toBe('12.3 mi')
    expect(formatDistanceMiles(null)).toBe('distance unavailable')
    expect(formatMovingTime(3725)).toBe('1h 2m')
    expect(formatMovingTime(undefined)).toBe('time unavailable')
  })
})
