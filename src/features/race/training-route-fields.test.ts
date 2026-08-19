import { describe, expect, it } from 'vitest'
import { TRAINING_ROUTE_DETAIL_COLUMNS, TRAINING_ROUTE_LIST_COLUMNS } from './training-route-fields'

describe('training route data projection', () => {
  it('loads the original GPX so imported waypoints remain available to the detail map', () => {
    expect(TRAINING_ROUTE_LIST_COLUMNS.split(',')).not.toContain('raw_gpx')
    expect(TRAINING_ROUTE_DETAIL_COLUMNS.split(',')).toContain('raw_gpx')
  })
})
