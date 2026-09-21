import type { Course, Race, TerrainNode, TrainingRoute, Waypoint } from '@/types/database'

export type OfficialUpdateSectionId = 'event' | 'resources' | 'drop_bag_template' | 'course' | 'waypoints' | 'terrain' | 'training_routes'

export type OfficialUpdateApplyTarget =
  | { kind: 'race_field'; field: keyof Race; value: unknown }
  | { kind: 'resources_field'; field: string; value: unknown }
  | { kind: 'resources_link_field'; linkKey: string; field: string; value: unknown }
  | { kind: 'resources_add_link'; entry: ResourceEntry }
  | { kind: 'resources_remove_link'; linkKey: string }
  | { kind: 'section'; section: OfficialUpdateSectionId }

export type OfficialUpdateChange = {
  id: string
  label: string
  current: string
  official: string
  apply: OfficialUpdateApplyTarget
}

export type OfficialUpdateSection = {
  id: OfficialUpdateSectionId
  title: string
  description: string
  changes: OfficialUpdateChange[]
}

export type OfficialUpdateData = {
  race: Race
  course: Course | null
  waypoints: Waypoint[]
  terrain: TerrainNode[]
  trainingRoutes: TrainingRoute[]
}

/** Treat blank string, null, and undefined as the same empty value; omit null keys in objects. */
export function normalizeComparable(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(normalizeComparable)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key, normalizeComparable(nested)] as const)
      .filter(([, nested]) => nested !== null)
      .sort(([a], [b]) => a.localeCompare(b))
    return Object.fromEntries(entries)
  }
  return value
}

export const same = (a: unknown, b: unknown) =>
  JSON.stringify(normalizeComparable(a)) === JSON.stringify(normalizeComparable(b))

const previewJson = (value: unknown) => {
  const serialized = JSON.stringify(value)
  if (!serialized) return String(value)
  return serialized.length > 140 ? `${serialized.slice(0, 137)}… (${serialized.length} characters)` : serialized
}

/** Full display for side-by-side panels (no truncation of strings). */
export const displayFull = (value: unknown) => {
  if (value === null || value === undefined) return 'Not set'
  if (value === '') return 'Blank'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return value
  if (Array.isArray(value) || typeof value === 'object') return previewJson(value)
  return String(value)
}

const countCoordinates = (value: unknown): number => {
  if (!Array.isArray(value)) return 0
  if (value.length >= 2 && value.every(item => typeof item === 'number')) return 1
  return value.reduce((total, item) => total + countCoordinates(item), 0)
}
const geometrySummary = (value: unknown) => {
  if (!value || typeof value !== 'object') return displayFull(value)
  const geometry = value as { type?: unknown; coordinates?: unknown }
  const points = countCoordinates(geometry.coordinates)
  return `${typeof geometry.type === 'string' ? geometry.type : 'Path'} with ${points} coordinate point${points === 1 ? '' : 's'}`
}
const listSummary = (value: unknown, label: string) => Array.isArray(value)
  ? `${value.length} ${label}${value.length === 1 ? '' : 's'}`
  : displayFull(value)
const textSummary = (value: unknown, label: string) => typeof value === 'string'
  ? `${value.length.toLocaleString()}-character ${label}`
  : displayFull(value)

type ResourceEntry = Record<string, unknown> & { id?: string; label?: string }
const resourceObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const resourceEntries = (value: unknown) => {
  const links = resourceObject(value).links
  return Array.isArray(links) ? links.filter(entry => entry && typeof entry === 'object') as ResourceEntry[] : []
}
const resourceKey = (entry: ResourceEntry, index: number) => entry.id || entry.label || String(index)

function replaceChange(
  id: string,
  label: string,
  current: unknown,
  official: unknown,
  apply: OfficialUpdateApplyTarget,
  currentDisplay = displayFull(current),
  officialDisplay = displayFull(official),
): OfficialUpdateChange[] {
  if (same(current, official)) return []
  return [{ id, label, current: currentDisplay, official: officialDisplay, apply }]
}

function resourceConfigChanges(current: unknown, official: unknown): OfficialUpdateChange[] {
  if (same(current, official)) return []
  const currentConfig = resourceObject(current)
  const officialConfig = resourceObject(official)
  const currentEntries = new Map(resourceEntries(current).map((entry, index) => [resourceKey(entry, index), entry]))
  const officialEntries = new Map(resourceEntries(official).map((entry, index) => [resourceKey(entry, index), entry]))
  const changes: OfficialUpdateChange[] = []
  for (const [key, entry] of officialEntries) {
    const existing = currentEntries.get(key)
    if (!existing) {
      changes.push({
        id: `resources.link.add.${key}`,
        label: `Add resource: ${entry.label || key}`,
        current: 'Not present',
        official: displayFull(entry.label || key),
        apply: { kind: 'resources_add_link', entry },
      })
      continue
    }
    const entryFields = new Set([...Object.keys(existing), ...Object.keys(entry)])
    entryFields.delete('id')
    for (const field of entryFields) {
      changes.push(...replaceChange(
        `resources.link.${key}.${field}`,
        `${entry.label || existing.label || key} — ${field.replace(/_/g, ' ')}`,
        existing[field],
        entry[field],
        { kind: 'resources_link_field', linkKey: key, field, value: entry[field] },
      ))
    }
  }
  for (const [key, entry] of currentEntries) {
    if (!officialEntries.has(key)) {
      changes.push({
        id: `resources.link.remove.${key}`,
        label: `Remove local resource: ${entry.label || key}`,
        current: displayFull(entry.label || key),
        official: 'Removed from official',
        apply: { kind: 'resources_remove_link', linkKey: key },
      })
    }
  }
  const configFields = new Set([...Object.keys(currentConfig), ...Object.keys(officialConfig)])
  configFields.delete('links')
  for (const field of configFields) {
    changes.push(...replaceChange(
      `resources.config.${field}`,
      field.replace(/_/g, ' '),
      currentConfig[field],
      officialConfig[field],
      { kind: 'resources_field', field, value: officialConfig[field] },
    ))
  }
  return changes.length ? changes : [{
    id: 'resources.config.replace',
    label: 'Resource configuration',
    current: 'Current configuration',
    official: 'Official configuration',
    apply: { kind: 'section', section: 'resources' },
  }]
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
    ...eventValueFields.flatMap(([key, label]) => replaceChange(
      `event.${key}`, label, current.race[key], official.race[key],
      { kind: 'race_field', field: key, value: official.race[key] },
    )),
    ...replaceChange('event.weather_history', 'Weather history', current.race.weather_history, official.race.weather_history, { kind: 'race_field', field: 'weather_history', value: official.race.weather_history }),
    ...replaceChange('event.qualifies_for', 'Qualifying races', current.race.qualifies_for, official.race.qualifies_for, { kind: 'race_field', field: 'qualifies_for', value: official.race.qualifies_for }),
    ...replaceChange('event.weather_locations', 'Weather locations', current.race.weather_locations, official.race.weather_locations, { kind: 'race_field', field: 'weather_locations', value: official.race.weather_locations }),
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
    ...resourceFields.flatMap(([key, label]) => replaceChange(
      `resources.race.${key}`, label, current.race[key], official.race[key],
      { kind: 'race_field', field: key, value: official.race[key] },
    )),
    ...resourceConfigChanges(current.race.resources_config, official.race.resources_config),
  ]
  if (resourceChanges.length) sections.push({ id: 'resources', title: 'Resources', description: 'Official links and published event information. Applying a checked change replaces only that value.', changes: resourceChanges })

  sections.push(...replaceChange(
    'drop_bag_template',
    'Default suggestion template',
    current.race.drop_bag_template,
    official.race.drop_bag_template,
    { kind: 'section', section: 'drop_bag_template' },
  ).map(change => ({
    id: 'drop_bag_template' as const,
    title: 'Drop-bag template',
    description: 'Default suggested items. Your checked items, custom items, bag names, and notes stay personal.',
    changes: [change],
  })))

  const courseValueFields: Array<[keyof Course, string, string]> = [
    ['total_distance_miles', 'Distance', ' miles'], ['total_elevation_gain_ft', 'Elevation gain', ' ft'],
    ['total_elevation_loss_ft', 'Elevation loss', ' ft'], ['max_elevation_ft', 'Maximum elevation', ' ft'],
    ['min_elevation_ft', 'Minimum elevation', ' ft'],
  ]
  const courseChanges = [
    ...courseValueFields.flatMap(([key, label, unit]) => replaceChange(
      `course.${key}`, `${label}${unit}`, current.course?.[key], official.course?.[key],
      { kind: 'section', section: 'course' },
      `${displayFull(current.course?.[key])}${current.course?.[key] == null ? '' : unit}`,
      `${displayFull(official.course?.[key])}${official.course?.[key] == null ? '' : unit}`,
    )),
    ...replaceChange(
      'course.geometry', 'Course geometry', current.course?.geometry, official.course?.geometry,
      { kind: 'section', section: 'course' },
      geometrySummary(current.course?.geometry), geometrySummary(official.course?.geometry),
    ),
    ...replaceChange(
      'course.elevation_samples', 'Elevation profile', current.course?.elevation_samples, official.course?.elevation_samples,
      { kind: 'section', section: 'course' },
      listSummary(current.course?.elevation_samples, 'sample'), listSummary(official.course?.elevation_samples, 'sample'),
    ),
    ...replaceChange(
      'course.raw_gpx', 'GPX source', current.course?.raw_gpx, official.course?.raw_gpx,
      { kind: 'section', section: 'course' },
      textSummary(current.course?.raw_gpx, 'GPX file'), textSummary(official.course?.raw_gpx, 'GPX file'),
    ),
  ]
  if (courseChanges.length) sections.push({ id: 'course', title: 'Course', description: 'GPX geometry, elevation profile, and course totals. Course updates apply together.', changes: courseChanges })

  const officialWaypoints = new Map(official.waypoints.map(wp => [wp.id, wp]))
  const currentWaypoints = new Map(current.waypoints.filter(wp => wp.official_source_waypoint_id).map(wp => [wp.official_source_waypoint_id!, wp]))
  const waypointFields: Array<[keyof Waypoint, string]> = [['name', 'Name'], ['mile', 'Mile'], ['lat', 'Latitude'], ['lon', 'Longitude'], ['elevation_ft', 'Elevation'], ['type', 'Type'], ['crew_allowed', 'Crew access'], ['pacer_allowed', 'Pacer access'], ['has_drop_bag', 'Drop bag'], ['cutoff_time', 'Cutoff'], ['notes', 'Official notes'], ['crew_relay_notes', 'Crew relay notes'], ['runner_next_leg_notes', 'Next-leg notes'], ['order_index', 'Order']]
  const waypointChanges = [
    ...official.waypoints.filter(wp => !currentWaypoints.has(wp.id)).map(wp => ({
      id: `waypoints.add.${wp.id}`,
      label: `Add station: ${wp.name}`,
      current: 'Not present',
      official: `mile ${displayFull(wp.mile)}`,
      apply: { kind: 'section' as const, section: 'waypoints' as const },
    })),
    ...[...currentWaypoints.entries()].filter(([id]) => !officialWaypoints.has(id)).map(([, wp]) => ({
      id: `waypoints.remove.${wp.id}`,
      label: `Remove station: ${wp.name}`,
      current: `mile ${displayFull(wp.mile)}`,
      official: 'Removed from official',
      apply: { kind: 'section' as const, section: 'waypoints' as const },
    })),
    ...[...currentWaypoints.entries()].flatMap(([id, wp]) => {
      const source = officialWaypoints.get(id)
      if (!source) return []
      return waypointFields.flatMap(([field, label]) => replaceChange(
        `waypoints.${id}.${field}`,
        `${source.name} — ${label}`,
        wp[field],
        source[field],
        { kind: 'section', section: 'waypoints' },
      ))
    }),
  ]
  if (waypointChanges.length) sections.push({ id: 'waypoints', title: 'Aid stations & access', description: 'Station locations, names, cutoffs, crew/pacer access, and official notes. Personal bag contents remain. Station updates apply together.', changes: waypointChanges })

  const officialTerrain = new Map(official.terrain.map(node => [node.id, node]))
  const currentTerrain = new Map(current.terrain.filter(node => node.official_source_terrain_node_id).map(node => [node.official_source_terrain_node_id!, node]))
  const terrainChanges = [
    ...official.terrain.filter(node => !currentTerrain.has(node.id)).map(node => ({
      id: `terrain.add.${node.id}`,
      label: `Add boundary`,
      current: 'Not present',
      official: `mile ${displayFull(node.mile)}, ${node.type}, difficulty ${displayFull(node.difficulty)}`,
      apply: { kind: 'section' as const, section: 'terrain' as const },
    })),
    ...[...currentTerrain.entries()].filter(([id]) => !officialTerrain.has(id)).map(([, node]) => ({
      id: `terrain.remove.${node.id}`,
      label: `Remove boundary`,
      current: `mile ${displayFull(node.mile)}, ${node.type}`,
      official: 'Removed from official',
      apply: { kind: 'section' as const, section: 'terrain' as const },
    })),
    ...[...currentTerrain.entries()].flatMap(([id, node]) => {
      const source = officialTerrain.get(id)
      if (!source) return []
      return ([['mile', 'Mile'], ['type', 'Type'], ['difficulty', 'Difficulty']] as Array<[keyof TerrainNode, string]>).flatMap(([field, label]) =>
        replaceChange(
          `terrain.${id}.${field}`,
          `Boundary at mile ${displayFull(source.mile)} — ${label}`,
          node[field],
          source[field],
          { kind: 'section', section: 'terrain' },
        ))
    }),
  ]
  if (terrainChanges.length) sections.push({ id: 'terrain', title: 'Terrain', description: 'Official terrain boundaries and difficulty values. Terrain updates apply together.', changes: terrainChanges })

  const officialRoutes = new Map(official.trainingRoutes.map(route => [route.id, route]))
  const currentRoutes = new Map(current.trainingRoutes.filter(route => route.official_source_training_route_id).map(route => [route.official_source_training_route_id!, route]))
  const routeValueFields: Array<[keyof TrainingRoute, string, string]> = [
    ['name', 'Name', ''], ['notes', 'Notes', ''], ['distance_miles', 'Distance', ' miles'],
    ['elevation_gain_ft', 'Elevation gain', ' ft'], ['elevation_loss_ft', 'Elevation loss', ' ft'],
    ['overlap_miles', 'Course overlap', ' miles'], ['sort_order', 'Display order', ''],
  ]
  const routeChanges = [
    ...official.trainingRoutes.filter(route => !currentRoutes.has(route.id)).map(route => ({
      id: `training_routes.add.${route.id}`,
      label: `Add official route: ${route.name}`,
      current: 'Not present',
      official: `${displayFull(route.distance_miles)} miles`,
      apply: { kind: 'section' as const, section: 'training_routes' as const },
    })),
    ...[...currentRoutes.entries()].filter(([id]) => !officialRoutes.has(id)).map(([, route]) => ({
      id: `training_routes.remove.${route.id}`,
      label: `Official route removed: ${route.name}`,
      current: route.name,
      official: 'Your saved copy and Strava history will remain as a personal route',
      apply: { kind: 'section' as const, section: 'training_routes' as const },
    })),
    ...[...currentRoutes.entries()].flatMap(([id, route]) => {
      const source = officialRoutes.get(id)
      if (!source) return []
      const changes = routeValueFields.flatMap(([field, label, unit]) => replaceChange(
        `training_routes.${id}.${field}`,
        `${source.name} — ${label}`,
        route[field],
        source[field],
        { kind: 'section', section: 'training_routes' },
        `${displayFull(route[field])}${route[field] == null || !unit ? '' : unit}`,
        `${displayFull(source[field])}${source[field] == null || !unit ? '' : unit}`,
      ))
      if (!same(route.geometry, source.geometry) || !same(route.raw_gpx, source.raw_gpx) || !same(route.elevation_samples, source.elevation_samples)) {
        changes.push({
          id: `training_routes.${id}.path`,
          label: `${source.name} — route path`,
          current: 'Current official-derived path',
          official: 'Official path, GPX, and elevation profile',
          apply: { kind: 'section', section: 'training_routes' },
        })
      }
      if (!same(route.overlap_segments, source.overlap_segments)) {
        changes.push({
          id: `training_routes.${id}.overlap_segments`,
          label: `${source.name} — course-overlap sections`,
          current: 'Current overlap sections',
          official: 'Official overlap sections',
          apply: { kind: 'section', section: 'training_routes' },
        })
      }
      return changes
    }),
  ]
  if (routeChanges.length) sections.push({ id: 'training_routes', title: 'Training routes', description: 'Official route library changes. Personal-only routes and each runner’s Strava inputs/results remain. Route updates apply together.', changes: routeChanges })
  return sections
}

export function applyResourcesConfigOps(currentConfig: unknown, ops: OfficialUpdateApplyTarget[]): Record<string, unknown> {
  const config: Record<string, unknown> = { ...resourceObject(currentConfig) }
  let links = resourceEntries(currentConfig).map(entry => ({ ...entry }))
  for (const op of ops) {
    if (op.kind === 'resources_field') config[op.field] = op.value
    else if (op.kind === 'resources_link_field') {
      const index = links.findIndex((entry, i) => resourceKey(entry, i) === op.linkKey)
      if (index >= 0) links[index] = { ...links[index], [op.field]: op.value }
    } else if (op.kind === 'resources_add_link') {
      if (!links.some((entry, i) => resourceKey(entry, i) === resourceKey(op.entry, links.length))) links.push({ ...op.entry })
    } else if (op.kind === 'resources_remove_link') {
      links = links.filter((entry, i) => resourceKey(entry, i) !== op.linkKey)
    }
  }
  config.links = links
  return config
}

export function partitionOfficialUpdateSelection(sections: OfficialUpdateSection[], selectedIds: Iterable<string>) {
  const selected = new Set(selectedIds)
  const selectedChanges = sections.flatMap(section => section.changes.filter(change => selected.has(change.id)))
  const raceFields: Partial<Record<keyof Race, unknown>> = {}
  const resourceOps: OfficialUpdateApplyTarget[] = []
  const rpcSections = new Set<OfficialUpdateSectionId>()
  let resourcesFullReplace = false

  for (const change of selectedChanges) {
    const { apply } = change
    if (apply.kind === 'race_field') raceFields[apply.field] = apply.value
    else if (
      apply.kind === 'resources_field'
      || apply.kind === 'resources_link_field'
      || apply.kind === 'resources_add_link'
      || apply.kind === 'resources_remove_link'
    ) resourceOps.push(apply)
    else if (apply.kind === 'section') {
      rpcSections.add(apply.section)
      if (apply.section === 'resources') resourcesFullReplace = true
    }
  }

  return { selectedChanges, raceFields, resourceOps, rpcSections: [...rpcSections], resourcesFullReplace }
}
