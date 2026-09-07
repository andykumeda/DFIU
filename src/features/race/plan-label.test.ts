import { describe, expect, it } from 'vitest'
import { formatPlanALabel } from './plan-label'

describe('configured Plan A goal labels', () => {
  it('uses total elapsed hours, including minute rounding across an hour', () => {
    expect(formatPlanALabel(1740)).toBe('Plan A (29:00)')
    expect(formatPlanALabel(1775)).toBe('Plan A (29:35)')
    expect(formatPlanALabel(1799.8)).toBe('Plan A (30:00)')
    expect(formatPlanALabel(6000)).toBe('Plan A (100:00)')
  })
  it('does not invent a time for an unavailable goal', () => {
    for (const minutes of [0, -1, NaN, Infinity]) {
      expect(formatPlanALabel(minutes)).toBe('Plan A (not set)')
    }
  })
})
