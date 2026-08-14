import { describe, expect, it } from 'vitest'
import { fitLonLatBox } from './TrainingRouteDetailMap'

describe('fitLonLatBox', () => {
  it('expands a square-ish trail bbox to the thumbnail aspect', () => {
    const box = fitLonLatBox(-118.0, 34.2, -117.9, 34.3, 100 / 56)
    const lonSpan = box.maxLon - box.minLon
    const latSpan = box.maxLat - box.minLat
    expect(lonSpan).toBeGreaterThan(0.1)
    expect(latSpan).toBeGreaterThan(0.1)
    expect(box.minLon).toBeLessThan(-118)
    expect(box.maxLon).toBeGreaterThan(-117.9)
  })
})
