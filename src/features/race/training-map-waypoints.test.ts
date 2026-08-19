import { describe, expect, it } from 'vitest'
import {
  trainingElevationWaypoints,
  trainingWaypointFeatureCollection,
  trainingWaypointKind,
} from './training-map-waypoints'

describe('trainingWaypointFeatureCollection', () => {
  it('creates labeled map points for every imported GPX waypoint', () => {
    const collection = trainingWaypointFeatureCollection([
      { name: 'Start', lat: 34.27, lon: -118.15 },
      { name: 'Water', lat: 34.25, lon: -118.05 },
    ])

    expect(collection.features[0]).toEqual(expect.objectContaining({
      properties: { name: 'Start', kind: 'start', markerLabel: 'S', color: '#16a34a' },
      geometry: { type: 'Point', coordinates: [-118.15, 34.27] },
    }))
    expect(collection.features[1]).toEqual(expect.objectContaining({
      properties: { name: 'Water', kind: 'water', markerLabel: 'W', color: '#2563eb' },
      geometry: { type: 'Point', coordinates: [-118.05, 34.25] },
    }))
  })

  it('classifies start, finish, and water names without relying on color alone', () => {
    expect(trainingWaypointKind('Trail Start')).toBe('start')
    expect(trainingWaypointKind('Finish Line')).toBe('finish')
    expect(trainingWaypointKind('Water fountain')).toBe('water')
    expect(trainingWaypointKind('Scenic overlook')).toBe('waypoint')
  })

  it('places semantic endpoints and an intermediate waypoint on the elevation profile', () => {
    const points = trainingElevationWaypoints([
      { name: 'Start', lat: 34, lon: -118 },
      { name: 'Water', lat: 34, lon: -117.99 },
      { name: 'Finish', lat: 34, lon: -117.98 },
    ], [[-118, 34], [-117.99, 34], [-117.98, 34]], 1.2)

    expect(points[0]).toMatchObject({ mile: 0, type: 'start' })
    expect(points[1].mile).toBeGreaterThan(0)
    expect(points[1]).toMatchObject({ type: 'water_only' })
    expect(points[2]).toMatchObject({ mile: 1.2, type: 'finish' })
  })
})
