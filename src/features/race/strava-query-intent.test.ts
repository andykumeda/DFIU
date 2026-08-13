import { describe, expect, it } from 'vitest'
import { classifyStravaQueryIntent } from '../../../supabase/functions/_shared/strava-query-intent'

describe('classifyStravaQueryIntent', () => {
  it.each([
    ['Show my saved routes', 'routes'],
    ['Show my starred segments', 'segments'],
    ['Show my athlete stats', 'stats'],
    ['Show my recent activities', 'activities'],
    ['Show my latest runs', 'activities'],
    ['What should I run next?', 'unknown'],
    ['How should I train for this race?', 'unknown'],
  ] as const)('classifies %s as %s', (query, expected) => {
    expect(classifyStravaQueryIntent(query)).toBe(expected)
  })
})
