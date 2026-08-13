import { describe, expect, it } from 'vitest'
import { formatDistanceMiles, formatMovingTime, normalizeStravaQuery, parseStravaApiRequest } from './strava-query'

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

  it('parses safe read-only raw Strava API requests', () => {
    expect(parseStravaApiRequest('GET /athlete/routes?page=1')).toEqual({
      method: 'GET',
      path: '/athlete/routes?page=1',
    })
    expect(parseStravaApiRequest('PUT /segments/123/starred')).toBeNull()
    expect(parseStravaApiRequest('GET https://example.com/secret')).toBeNull()
    expect(parseStravaApiRequest('GET /athlete/../secret')).toBeNull()
  })
})
