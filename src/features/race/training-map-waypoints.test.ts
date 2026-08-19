import { describe, expect, it } from 'vitest'
import { trainingWaypointFeatureCollection } from './training-map-waypoints'

describe('trainingWaypointFeatureCollection', () => {
  it('creates labeled map points for every imported GPX waypoint', () => {
    const collection = trainingWaypointFeatureCollection([
      { name: 'Start', lat: 34.27, lon: -118.15 },
      { name: 'Water', lat: 34.25, lon: -118.05 },
    ])

    expect(collection.features).toEqual([
      expect.objectContaining({ properties: { name: 'Start' }, geometry: { type: 'Point', coordinates: [-118.15, 34.27] } }),
      expect.objectContaining({ properties: { name: 'Water' }, geometry: { type: 'Point', coordinates: [-118.05, 34.25] } }),
    ])
  })
})
