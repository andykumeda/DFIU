import { describe, expect, it } from 'vitest'
import type { Course, Race, TerrainNode, Waypoint } from '@/types/database'
import { buildOfficialUpdateSections } from './official-update-diff'

describe('official update review', () => {
  it('separates official changes into selectable areas and ignores personal bag contents', () => {
    const race = { id: 'clone', location: 'Old', resources_config: { links: [] }, drop_bag_template: { official: [] } } as unknown as Race
    const officialRace = { ...race, id: 'source', location: 'New', resources_config: { links: [{ label: 'Guide' }] }, drop_bag_template: { official: [{ text: 'Lamp' }] } } as unknown as Race
    const course = { id: 'clone-course', total_distance_miles: 100, total_elevation_gain_ft: 10000, geometry: { coordinates: [] } } as unknown as Course
    const officialCourse = { ...course, id: 'source-course', total_distance_miles: 101 } as Course
    const waypoint = { id: 'clone-wp', official_source_waypoint_id: 'source-wp', name: 'Old Aid', mile: 10, drop_bag_items: [{ text: 'Personal' }] } as unknown as Waypoint
    const officialWaypoint = { ...waypoint, id: 'source-wp', official_source_waypoint_id: null, name: 'New Aid', drop_bag_items: [{ text: 'Official' }] } as Waypoint
    const terrain = [{ id: 'clone-terrain', official_source_terrain_node_id: 'source-terrain', mile: 0, type: 'trail', difficulty: 100 }] as unknown as TerrainNode[]
    const officialTerrain = [{ id: 'source-terrain', official_source_terrain_node_id: null, mile: 0, type: 'technical', difficulty: 118 }] as unknown as TerrainNode[]

    const sections = buildOfficialUpdateSections(
      { race, course, waypoints: [waypoint], terrain },
      { race: officialRace, course: officialCourse, waypoints: [officialWaypoint], terrain: officialTerrain },
    )

    expect(sections.map(section => section.id)).toEqual(['event', 'resources', 'drop_bag_template', 'course', 'waypoints', 'terrain'])
    expect(sections.find(section => section.id === 'waypoints')?.changes).toEqual(['Updated: New Aid'])
    expect(sections.flatMap(section => section.changes).join(' ')).not.toContain('Personal')
  })
})
