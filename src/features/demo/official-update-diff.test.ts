import { describe, expect, it } from 'vitest'
import type { Course, Race, TerrainNode, TrainingRoute, Waypoint } from '@/types/database'
import {
  applyResourcesConfigOps,
  buildOfficialUpdateSections,
  normalizeComparable,
  partitionOfficialUpdateSelection,
  same,
} from './official-update-diff'

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
    expect(sections.find(section => section.id === 'waypoints')?.changes.map(change => change.label)).toContain('New Aid — Name')
    expect(sections.find(section => section.id === 'resources')?.changes.map(change => change.label)).toContain('Add resource: Guide')
    expect(sections.find(section => section.id === 'resources')?.changes.some(change => /embed/i.test(change.label))).toBe(false)
    expect(sections.find(section => section.id === 'course')?.changes.find(change => change.id === 'course.geometry')?.official).toContain('2 coordinate points')
    expect(sections.find(section => section.id === 'training_routes')?.changes.map(change => change.label)).toContain('New route — Name')
    expect(sections.find(section => section.id === 'training_routes')?.description).toContain('Strava inputs/results remain')
    expect(sections.flatMap(section => section.changes).map(change => `${change.label}\n${change.current}\n${change.official}`).join('\n')).not.toContain('Personal')
  })

  it('treats blank string and null as equivalent empty values', () => {
    expect(same('', null)).toBe(true)
    expect(same({ embed_url: '' }, { embed_url: null })).toBe(true)
    expect(normalizeComparable({ a: '', b: 1 })).toEqual({ b: 1 })
  })

  it('keeps full text for side-by-side comparison and supports per-change resource apply', () => {
    const longCurrent = `# Friday, October 2\n${'x'.repeat(200)}`
    const longOfficial = `# Saturday, August 22\n${'y'.repeat(200)}`
    const race = {
      id: 'clone',
      resources_config: {
        schedule_info: longCurrent,
        links: [{ id: 'notes', label: 'Runner Notes', content: 'short', embed_url: '' }],
      },
    } as unknown as Race
    const officialRace = {
      ...race,
      id: 'source',
      resources_config: {
        schedule_info: longOfficial,
        links: [{ id: 'notes', label: 'Runner Notes', content: 'longer official notes', embed_url: null }],
      },
    } as unknown as Race

    const sections = buildOfficialUpdateSections(
      { race, course: null, waypoints: [], terrain: [], trainingRoutes: [] },
      { race: officialRace, course: null, waypoints: [], terrain: [], trainingRoutes: [] },
    )
    const resources = sections.find(section => section.id === 'resources')
    expect(resources?.changes).toHaveLength(2)
    const schedule = resources?.changes.find(change => change.id === 'resources.config.schedule_info')
    const notes = resources?.changes.find(change => change.id === 'resources.link.notes.content')
    expect(schedule?.current).toBe(longCurrent)
    expect(schedule?.official).toBe(longOfficial)
    expect(notes?.current).toBe('short')
    expect(notes?.official).toBe('longer official notes')

    const onlyNotes = partitionOfficialUpdateSelection(sections, [notes!.id])
    expect(onlyNotes.resourceOps).toHaveLength(1)
    expect(onlyNotes.rpcSections).toEqual([])
    const merged = applyResourcesConfigOps(race.resources_config, onlyNotes.resourceOps)
    expect(merged.schedule_info).toBe(longCurrent)
    expect((merged.links as Array<{ content?: string }>)[0].content).toBe('longer official notes')
  })
})
