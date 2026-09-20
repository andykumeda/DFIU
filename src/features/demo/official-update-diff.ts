import type { Course, Race, TerrainNode, TrainingRoute, Waypoint } from '@/types/database'

export type OfficialUpdateSectionId = 'event' | 'resources' | 'drop_bag_template' | 'course' | 'waypoints' | 'terrain' | 'training_routes'

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
  trainingRoutes: TrainingRoute[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const previewJson = (value: unknown) => {
  const serialized = JSON.stringify(value)
  if (!serialized) return String(value)
  return serialized.length > 140 ? `${serialized.slice(0, 137)}… (${serialized.length} characters)` : serialized
}
const display = (value: unknown) => {
  if (value === null || value === undefined) return 'Not set'
  if (value === '') return 'Blank'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value.length > 100 ? `“${value.slice(0, 97).trim()}…” (${value.length} characters)` : value
  if (Array.isArray(value) || typeof value === 'object') return previewJson(value)
  return String(value)
}
const countCoordinates = (value: unknown): number => {
  if (!Array.isArray(value)) return 0
  if (value.length >= 2 && value.every(item => typeof item === 'number')) return 1
  return value.reduce((total, item) => total + countCoordinates(item), 0)
}
const geometrySummary = (value: unknown) => {
  if (!value || typeof value !== 'object') return display(value)
  const geometry = value as { type?: unknown; coordinates?: unknown }
  const points = countCoordinates(geometry.coordinates)
  return `${typeof geometry.type === 'string' ? geometry.type : 'Path'} with ${points} coordinate point${points === 1 ? '' : 's'}`
}
const listSummary = (value: unknown, label: string) => Array.isArray(value)
  ? `${value.length} ${label}${value.length === 1 ? '' : 's'}`
  : display(value)
const textSummary = (value: unknown, label: string) => typeof value === 'string'
  ? `${value.length.toLocaleString()}-character ${label}`
  : display(value)
const valueChange = (label: string, current: unknown, official: unknown) =>
  `${label}: ${display(current)} → ${display(official)}`
const detailedChange = (label: string, current: unknown, official: unknown) =>
  same(current, official) ? [] : [valueChange(label, current, official)]

type ResourceEntry = Record<string, unknown> & { id?: string; label?: string }
const resourceObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const resourceEntries = (value: unknown) => {
  const links = resourceObject(value).links
  return Array.isArray(links) ? links.filter(entry => entry && typeof entry === 'object') as ResourceEntry[] : []
}
const resourceKey = (entry: ResourceEntry, index: number) => entry.id || entry.label || String(index)
function resourceConfigChanges(current: unknown, official: unknown): string[] {
  if (same(current, official)) return []
  const currentConfig = resourceObject(current)
  const officialConfig = resourceObject(official)
  const currentEntries = new Map(resourceEntries(current).map((entry, index) => [resourceKey(entry, index), entry]))
  const officialEntries = new Map(resourceEntries(official).map((entry, index) => [resourceKey(entry, index), entry]))
  const changes: string[] = []
  for (const [key, entry] of officialEntries) {
    const existing = currentEntries.get(key)
    if (!existing) {
      changes.push(`Add resource: ${entry.label || key}`)
      continue
    }
    const entryFields = new Set([...Object.keys(existing), ...Object.keys(entry)])
    entryFields.delete('id')
    for (const field of entryFields) {
      if (!same(existing[field], entry[field])) changes.push(`${entry.label || existing.label || key} — ${valueChange(field.replace(/_/g, ' '), existing[field], entry[field])}`)
    }
  }
  for (const [key, entry] of currentEntries) {
    if (!officialEntries.has(key)) changes.push(`Remove local resource: ${entry.label || key}`)
  }
  const configFields = new Set([...Object.keys(currentConfig), ...Object.keys(officialConfig)])
  configFields.delete('links')
  for (const field of configFields) {
    if (!same(currentConfig[field], officialConfig[field])) changes.push(valueChange(field.replace(/_/g, ' '), currentConfig[field], officialConfig[field]))
  }
  return changes.length ? changes : ['Resource configuration will be replaced by the official version']
}

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
    ...detailedChange('Weather history', current.race.weather_history, official.race.weather_history),
    ...detailedChange('Qualifying races', current.race.qualifies_for, official.race.qualifies_for),
    ...detailedChange('Weather locations', current.race.weather_locations, official.race.weather_locations),
  ]
  if (eventChanges.length) sections.push({ id: 'event', title: 'Event details', description: 'Schedule, location, weather, and event facts.', changes: eventChanges })

  const resourceFields: Array<[keyof Race, string]> = [
    ['racebook_url', 'Racebook'],
    ['racebook_last_updated', 'Racebook update date'], ['briefing_url', 'Briefing'],
    ['briefing_datetime', 'Briefing date'], ['packet_pickup_url', 'Packet pickup'],
    ['packet_pickup_datetime', 'Packet pickup date'], ['packet_pickup_info', 'Packet pickup information'],
    ['past_results_url', 'Past results'], ['media_url', 'Media'], ['entrants_url', 'Entrants'],
    ['tracking_url', 'Tracking'], ['lodging_info', 'Lodging information'],
  ]
  const resourceChanges = [
    ...resourceFields.flatMap(([key, label]) => detailedChange(label, current.race[key], official.race[key])),
    ...resourceConfigChanges(current.race.resources_config, official.race.resources_config),
  ]
  if (resourceChanges.length) sections.push({ id: 'resources', title: 'Resources', description: 'Official links and published event information. Applying replaces the listed local values.', changes: resourceChanges })

  if (!same(current.race.drop_bag_template, official.race.drop_bag_template)) {
    sections.push({ id: 'drop_bag_template', title: 'Drop-bag template', description: 'Default suggested items. Your checked items, custom items, bag names, and notes stay personal.', changes: [valueChange('Default suggestion template', current.race.drop_bag_template, official.race.drop_bag_template)] })
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
    ...(same(current.course?.geometry, official.course?.geometry) ? [] : [`Course geometry: ${geometrySummary(current.course?.geometry)} → ${geometrySummary(official.course?.geometry)}`]),
    ...(same(current.course?.elevation_samples, official.course?.elevation_samples) ? [] : [`Elevation profile: ${listSummary(current.course?.elevation_samples, 'sample')} → ${listSummary(official.course?.elevation_samples, 'sample')}`]),
    ...(same(current.course?.raw_gpx, official.course?.raw_gpx) ? [] : [`GPX source: ${textSummary(current.course?.raw_gpx, 'GPX file')} → ${textSummary(official.course?.raw_gpx, 'GPX file')}`]),
  )
  if (courseChanges.length) sections.push({ id: 'course', title: 'Course', description: 'GPX geometry, elevation profile, and course totals.', changes: courseChanges })

  const officialWaypoints = new Map(official.waypoints.map(wp => [wp.id, wp]))
  const currentWaypoints = new Map(current.waypoints.filter(wp => wp.official_source_waypoint_id).map(wp => [wp.official_source_waypoint_id!, wp]))
  const waypointFields: Array<[keyof Waypoint, string]> = [['name', 'Name'], ['mile', 'Mile'], ['lat', 'Latitude'], ['lon', 'Longitude'], ['elevation_ft', 'Elevation'], ['type', 'Type'], ['crew_allowed', 'Crew access'], ['pacer_allowed', 'Pacer access'], ['has_drop_bag', 'Drop bag'], ['cutoff_time', 'Cutoff'], ['notes', 'Official notes'], ['crew_relay_notes', 'Crew relay notes'], ['runner_next_leg_notes', 'Next-leg notes'], ['order_index', 'Order']]
  const added = official.waypoints.filter(wp => !currentWaypoints.has(wp.id)).map(wp => `Add station: ${wp.name} at mile ${display(wp.mile)}`)
  const removed = [...currentWaypoints.entries()].filter(([id]) => !officialWaypoints.has(id)).map(([, wp]) => `Remove station: ${wp.name} at mile ${display(wp.mile)}`)
  const modified = [...currentWaypoints.entries()].flatMap(([id, wp]) => {
    const source = officialWaypoints.get(id)
    return source ? waypointFields.flatMap(([field, label]) => same(wp[field], source[field]) ? [] : [`${source.name} — ${valueChange(label, wp[field], source[field])}`]) : []
  })
  if (added.length || removed.length || modified.length) sections.push({ id: 'waypoints', title: 'Aid stations & access', description: 'Station locations, names, cutoffs, crew/pacer access, and official notes. Personal bag contents remain.', changes: [
    ...added, ...removed, ...modified,
  ] })

  const officialTerrain = new Map(official.terrain.map(node => [node.id, node]))
  const currentTerrain = new Map(current.terrain.filter(node => node.official_source_terrain_node_id).map(node => [node.official_source_terrain_node_id!, node]))
  const terrainChanges = [
    ...official.terrain.filter(node => !currentTerrain.has(node.id)).map(node => `Add boundary: mile ${display(node.mile)}, ${node.type}, difficulty ${display(node.difficulty)}`),
    ...[...currentTerrain.entries()].filter(([id]) => !officialTerrain.has(id)).map(([, node]) => `Remove boundary: mile ${display(node.mile)}, ${node.type}`),
    ...[...currentTerrain.entries()].flatMap(([id, node]) => {
      const source = officialTerrain.get(id)
      if (!source) return []
      return ([['mile', 'Mile'], ['type', 'Type'], ['difficulty', 'Difficulty']] as Array<[keyof TerrainNode, string]>).flatMap(([field, label]) => same(node[field], source[field]) ? [] : [`Boundary at mile ${display(source.mile)} — ${valueChange(label, node[field], source[field])}`])
    }),
  ]
  if (terrainChanges.length) sections.push({ id: 'terrain', title: 'Terrain', description: 'Official terrain boundaries and difficulty values. Applying replaces the listed values.', changes: terrainChanges })

  const officialRoutes = new Map(official.trainingRoutes.map(route => [route.id, route]))
  const currentRoutes = new Map(current.trainingRoutes.filter(route => route.official_source_training_route_id).map(route => [route.official_source_training_route_id!, route]))
  const routeValueFields: Array<[keyof TrainingRoute, string, string]> = [
    ['name', 'Name', ''], ['notes', 'Notes', ''], ['distance_miles', 'Distance', ' miles'],
    ['elevation_gain_ft', 'Elevation gain', ' ft'], ['elevation_loss_ft', 'Elevation loss', ' ft'],
    ['overlap_miles', 'Course overlap', ' miles'], ['sort_order', 'Display order', ''],
  ]
  const routeChanges = [
    ...official.trainingRoutes.filter(route => !currentRoutes.has(route.id)).map(route => `Add official route: ${route.name} (${display(route.distance_miles)} miles)`),
    ...[...currentRoutes.entries()].filter(([id]) => !officialRoutes.has(id)).map(([, route]) => `Official route removed: ${route.name}; your saved copy and Strava history will remain as a personal route`),
    ...[...currentRoutes.entries()].flatMap(([id, route]) => {
      const source = officialRoutes.get(id)
      if (!source) return []
      const changes = routeValueFields.flatMap(([field, label, unit]) => same(route[field], source[field]) ? [] : [`${source.name} — ${valueChange(label, route[field], source[field])}${unit}`])
      if (!same(route.geometry, source.geometry) || !same(route.raw_gpx, source.raw_gpx) || !same(route.elevation_samples, source.elevation_samples)) {
        changes.push(`${source.name} — route path, GPX, and elevation profile will replace the current official-derived version`)
      }
      if (!same(route.overlap_segments, source.overlap_segments)) changes.push(`${source.name} — course-overlap sections will be replaced by the official version`)
      return changes
    }),
  ]
  if (routeChanges.length) sections.push({ id: 'training_routes', title: 'Training routes', description: 'Official route library changes. Personal-only routes and each runner’s Strava inputs/results remain.', changes: routeChanges })
  return sections
}
