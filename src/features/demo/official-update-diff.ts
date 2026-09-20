import type { Course, Race, TerrainNode, Waypoint } from '@/types/database'

export type OfficialUpdateSectionId = 'event' | 'resources' | 'drop_bag_template' | 'course' | 'waypoints' | 'terrain'

export type OfficialUpdateSection = {
  id: OfficialUpdateSectionId
  title: string
  description: string
  changes: string[]
}

export type OfficialUpdateData = {
  race: Race
  course: Course | null
  waypoints: Waypoint[]
  terrain: TerrainNode[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const display = (value: unknown) => value === null || value === undefined || value === '' ? 'Not set' : String(value)
const valueChange = (label: string, current: unknown, official: unknown) =>
  `${label}: ${display(current)} → ${display(official)}`
const changedLabel = (label: string, current: unknown, official: unknown) =>
  same(current, official) ? [] : [`${label} changed`]

export function buildOfficialUpdateSections(current: OfficialUpdateData, official: OfficialUpdateData): OfficialUpdateSection[] {
  const sections: OfficialUpdateSection[] = []
  const eventValueFields: Array<[keyof Race, string]> = [
    ['start_datetime', 'Start'], ['location', 'Location'], ['distance_miles', 'Distance'],
    ['overall_cutoff', 'Overall cutoff'], ['course_type', 'Course type'], ['terrain_type', 'Terrain'],
    ['avg_temp_high', 'Average high'], ['avg_temp_low', 'Average low'], ['weather_notes', 'Weather notes'],
    ['timezone', 'Time zone'], ['registration_url', 'Registration link'], ['website_url', 'Website'],
    ['course_record_male', 'Men’s course record'], ['course_record_female', 'Women’s course record'],
    ['sunrise_time', 'Sunrise'], ['sunset_time', 'Sunset'], ['moon_phase', 'Moon phase'],
    ['precip_chance', 'Precipitation chance'],
  ]
  const eventChanges = [
    ...eventValueFields.flatMap(([key, label]) => same(current.race[key], official.race[key])
      ? [] : [valueChange(label, current.race[key], official.race[key])]),
    ...changedLabel('Weather history', current.race.weather_history, official.race.weather_history),
    ...changedLabel('Qualifying races', current.race.qualifies_for, official.race.qualifies_for),
    ...changedLabel('Weather locations', current.race.weather_locations, official.race.weather_locations),
  ]
  if (eventChanges.length) sections.push({ id: 'event', title: 'Event details', description: 'Schedule, location, weather, and event facts.', changes: eventChanges })

  const resourceFields: Array<[keyof Race, string]> = [
    ['resources_config', 'Resource cards and text'], ['racebook_url', 'Racebook'],
    ['racebook_last_updated', 'Racebook update date'], ['briefing_url', 'Briefing'],
    ['briefing_datetime', 'Briefing date'], ['packet_pickup_url', 'Packet pickup'],
    ['packet_pickup_datetime', 'Packet pickup date'], ['packet_pickup_info', 'Packet pickup information'],
    ['past_results_url', 'Past results'], ['media_url', 'Media'], ['entrants_url', 'Entrants'],
    ['tracking_url', 'Tracking'], ['lodging_info', 'Lodging information'],
  ]
  const resourceChanges = resourceFields.flatMap(([key, label]) => same(current.race[key], official.race[key]) ? [] : [label])
  if (resourceChanges.length) sections.push({ id: 'resources', title: 'Resources', description: 'Official links and published event information.', changes: resourceChanges.map(label => `${label} changed`) })

  if (!same(current.race.drop_bag_template, official.race.drop_bag_template)) {
    sections.push({ id: 'drop_bag_template', title: 'Drop-bag template', description: 'Default suggested items. Your checked items, custom items, bag names, and notes stay personal.', changes: ['Official default bag suggestions changed'] })
  }

  const courseValueFields: Array<[keyof Course, string, string]> = [
    ['total_distance_miles', 'Distance', ' miles'], ['total_elevation_gain_ft', 'Elevation gain', ' ft'],
    ['total_elevation_loss_ft', 'Elevation loss', ' ft'], ['max_elevation_ft', 'Maximum elevation', ' ft'],
    ['min_elevation_ft', 'Minimum elevation', ' ft'],
  ]
  const courseChanges = courseValueFields.flatMap(([key, label, unit]) =>
    same(current.course?.[key], official.course?.[key]) ? []
      : [`${valueChange(label, current.course?.[key], official.course?.[key])}${unit}`])
  courseChanges.push(
    ...changedLabel('Course geometry', current.course?.geometry, official.course?.geometry),
    ...changedLabel('Elevation profile', current.course?.elevation_samples, official.course?.elevation_samples),
    ...changedLabel('GPX source', current.course?.raw_gpx, official.course?.raw_gpx),
  )
  if (courseChanges.length) sections.push({ id: 'course', title: 'Course', description: 'GPX geometry, elevation profile, and course totals.', changes: courseChanges })

  const officialWaypoints = new Map(official.waypoints.map(wp => [wp.id, wp]))
  const currentWaypoints = new Map(current.waypoints.filter(wp => wp.official_source_waypoint_id).map(wp => [wp.official_source_waypoint_id!, wp]))
  const waypointFields: Array<keyof Waypoint> = ['name', 'mile', 'lat', 'lon', 'elevation_ft', 'type', 'crew_allowed', 'pacer_allowed', 'has_drop_bag', 'cutoff_time', 'notes', 'crew_relay_notes', 'runner_next_leg_notes', 'order_index']
  const added = official.waypoints.filter(wp => !currentWaypoints.has(wp.id)).map(wp => wp.name)
  const removed = [...currentWaypoints.entries()].filter(([id]) => !officialWaypoints.has(id)).map(([, wp]) => wp.name)
  const modified = [...currentWaypoints.entries()].flatMap(([id, wp]) => {
    const source = officialWaypoints.get(id)
    return source && waypointFields.some(field => !same(wp[field], source[field])) ? [source.name] : []
  })
  if (added.length || removed.length || modified.length) sections.push({ id: 'waypoints', title: 'Aid stations & access', description: 'Station locations, names, cutoffs, crew/pacer access, and official notes. Personal bag contents remain.', changes: [
    ...(added.length ? [`Added: ${added.join(', ')}`] : []),
    ...(removed.length ? [`Removed: ${removed.join(', ')}`] : []),
    ...(modified.length ? [`Updated: ${modified.join(', ')}`] : []),
  ] })

  const terrainShape = (nodes: TerrainNode[]) => nodes.map(node => ({ source: node.official_source_terrain_node_id ?? node.id, mile: node.mile, type: node.type, difficulty: node.difficulty }))
  if (!same(terrainShape(current.terrain), terrainShape(official.terrain))) {
    sections.push({ id: 'terrain', title: 'Terrain', description: 'Official terrain boundaries and difficulty values.', changes: [`${current.terrain.length} boundaries → ${official.terrain.length} boundaries`] })
  }
  return sections
}
