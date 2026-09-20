import { describe, expect, it } from 'vitest'
import type { Course, Race, TerrainNode, TrainingRoute, Waypoint } from '@/types/database'
import { buildOfficialUpdateSections } from './official-update-diff'

describe('official update review', () => {
  it('separates official changes into selectable areas and ignores personal bag contents', () => {
    const race = { id: 'clone', location: 'Old', resources_config: { links: [{ id: 'map', label: 'Map', embed_url: '' }] }, drop_bag_template: { official: [] } } as unknown as Race
    const officialRace = { ...race, id: 'source', location: 'New', resources_config: { links: [{ id: 'map', label: 'Map', embed_url: null }, { label: 'Guide' }] }, drop_bag_template: { official: [{ text: 'Lamp' }] } } as unknown as Race
    const course = { id: 'clone-course', total_distance_miles: 100, total_elevation_gain_ft: 10000, geometry: { type: 'LineString', coordinates: [[1, 2]] } } as unknown as Course
    const officialCourse = { ...course, id: 'source-course', total_distance_miles: 101, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } } as Course
    const waypoint = { id: 'clone-wp', official_source_waypoint_id: 'source-wp', name: 'Old Aid', mile: 10, drop_bag_items: [{ text: 'Personal' }] } as unknown as Waypoint
    const officialWaypoint = { ...waypoint, id: 'source-wp', official_source_waypoint_id: null, name: 'New Aid', drop_bag_items: [{ text: 'Official' }] } as Waypoint
    const terrain = [{ id: 'clone-terrain', official_source_terrain_node_id: 'source-terrain', mile: 0, type: 'trail', difficulty: 100 }] as unknown as TerrainNode[]
    const officialTerrain = [{ id: 'source-terrain', official_source_terrain_node_id: null, mile: 0, type: 'technical', difficulty: 118 }] as unknown as TerrainNode[]
    const trainingRoute = { id: 'clone-route', official_source_training_route_id: 'source-route', name: 'Old route', distance_miles: 10, geometry: { coordinates: [] }, strava_activity_inputs: [{ id: 'personal' }] } as unknown as TrainingRoute
    const officialTrainingRoute = { ...trainingRoute, id: 'source-route', official_source_training_route_id: null, name: 'New route', distance_miles: 11, strava_activity_inputs: [] } as TrainingRoute

    const sections = buildOfficialUpdateSections(
      { race, course, waypoints: [waypoint], terrain, trainingRoutes: [trainingRoute] },
      { race: officialRace, course: officialCourse, waypoints: [officialWaypoint], terrain: officialTerrain, trainingRoutes: [officialTrainingRoute] },
    )

    expect(sections.map(section => section.id)).toEqual(['event', 'resources', 'drop_bag_template', 'course', 'waypoints', 'terrain', 'training_routes'])
    expect(sections.find(section => section.id === 'waypoints')?.changes).toContain('New Aid — Name: Old Aid → New Aid')
    expect(sections.find(section => section.id === 'resources')?.changes).toContain('Map — embed url: Blank → Not set')
    expect(sections.find(section => section.id === 'course')?.changes).toContain('Course geometry: LineString with 1 coordinate point → LineString with 2 coordinate points')
    expect(sections.find(section => section.id === 'training_routes')?.changes).toContain('New route — Name: Old route → New route')
    expect(sections.find(section => section.id === 'training_routes')?.description).toContain('Strava inputs/results remain')
    expect(sections.flatMap(section => section.changes).join(' ')).not.toContain('Personal')
  })
})
