import { describe, expect, it } from 'vitest'
import { TRAINING_ROUTE_DETAIL_COLUMNS, TRAINING_ROUTE_LIST_COLUMNS } from './training-route-fields'

describe('training route data projection', () => {
  it('loads large GPX and elevation fields only for the selected detail route', () => {
    const listColumns = TRAINING_ROUTE_LIST_COLUMNS.split(',')
    const detailColumns = TRAINING_ROUTE_DETAIL_COLUMNS.split(',')

    expect(listColumns).not.toContain('raw_gpx')
    expect(listColumns).not.toContain('elevation_samples')
    expect(detailColumns).toContain('raw_gpx')
    expect(detailColumns).toContain('elevation_samples')
  })
})
