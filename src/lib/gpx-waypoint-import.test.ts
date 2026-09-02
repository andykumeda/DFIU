import { describe, expect, it } from 'vitest'
import { buildImportedWaypointRows } from './gpx-waypoint-import'

describe('buildImportedWaypointRows', () => {
  it('persists GPX aid stations and adds missing route endpoints', () => {
    const rows = buildImportedWaypointRows({
      waypoints: [{ name: 'Aid One', lat: 0, lon: 0.005 }],
      coordinates: [[0, 0], [0.01, 0]],
      stats: {
        totalDistanceMiles: 0.43,
        totalElevationGainFt: 0,
        totalElevationLossFt: 0,
        minElevationFt: 0,
        maxElevationFt: 0,
      },
    }, 'course-1')

    expect(rows.map(row => row.name)).toEqual(['Start', 'Aid One', 'Finish'])
    expect(rows[1]).toMatchObject({
      course_id: 'course-1',
      type: 'aid_station',
      mile: expect.closeTo(0.35, 1),
    })
    expect(rows.map(row => row.order_index)).toEqual([1, 2, 3])
  })

  it('deduplicates repeated equivalent GPX waypoint records', () => {
    const rows = buildImportedWaypointRows({
      waypoints: [
        { name: 'Sibley Aid', lat: 0, lon: 0.005 },
        { name: 'Sibley Aid', lat: 0, lon: 0.00501 },
      ],
      coordinates: [[0, 0], [0.01, 0]],
      stats: {
        totalDistanceMiles: 0.43,
        totalElevationGainFt: 0,
        totalElevationLossFt: 0,
        minElevationFt: 0,
        maxElevationFt: 0,
      },
    }, 'course-1', false)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Sibley Aid', type: 'aid_station' })
  })

  it('can omit endpoints when the route detail fallback owns them', () => {
    const rows = buildImportedWaypointRows({
      waypoints: [{ name: 'Aid One', lat: 0, lon: 0.005 }],
      coordinates: [[0, 0], [0.01, 0]],
      stats: {
        totalDistanceMiles: 0.43,
        totalElevationGainFt: 0,
        totalElevationLossFt: 0,
        minElevationFt: 0,
        maxElevationFt: 0,
      },
    }, 'course-1', false)

    expect(rows.map(row => row.name)).toEqual(['Aid One'])
  })
})
