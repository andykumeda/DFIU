import { useState, useEffect, useMemo, Suspense, lazy } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, MapPin, Globe, ArrowUpRight, CloudSun, Trophy, RefreshCw, Settings, Download, Save, CheckCircle2, Trash2, Share2 } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { RACE_SELECT } from '@/lib/race-select'
import { Race, Course, Waypoint, TerrainNode } from '@/types/database'
import { RaceMembersSection } from './RaceMembersSection'
import { fetchWeatherForRace, fetchCurrentWeather } from '@/lib/weather-service'
import { sampleElevationProfile, type GpxParseResult } from '@/lib/gpx-parser'
import { getCoordinateAtDistance, getNearestPointOnLine, getDistanceFromStart, getAllVisitsOnLine, getDistance } from '@/lib/geo-utils'
import { formatDate, formatStoredClockTime } from '@/lib/utils'
import SunCalc from 'suncalc'

const CourseMap = lazy(() =>
    import('@/features/course/CourseMap').then(m => ({ default: m.CourseMap }))
)
import { ElevationProfile } from '@/features/course/ElevationProfile'
import { GpxUploader } from '@/features/course/GpxUploader'
import { EditRaceModal } from '@/features/race/EditRaceModal'
import { EditWaypointModal } from '@/features/course/EditWaypointModal'
import { ViewWaypointModal } from '@/features/course/ViewWaypointModal'
import { TerrainSidebar } from '@/features/course/TerrainSidebar'
import { TerrainTypeValue, TERRAIN_TYPES, getTerrainColor, getTerrainDefaultDifficulty } from '@/features/course/terrain-constants'
import { PaceCalculator } from '@/features/race/PaceCalculator'
import { parseRunnerProfile } from '@/features/race/runner-profile'
import { RaceResources } from '@/features/race/RaceResources'
import { WeatherLocations } from '@/features/race/WeatherLocations'
import { DropBagsSection } from '@/features/race/DropBagsSection'

const CrewView = lazy(() =>
    import('@/features/race/CrewView').then(m => ({ default: m.CrewView }))
)

const LiveEventTab = lazy(() =>
    import('@/features/race/LiveEventTab').then(m => ({ default: m.LiveEventTab }))
)

type Tab = 'live' | 'overview' | 'map' | 'plan' | 'drop_bags' | 'resources' | 'crew' | 'members'
type ExistingRaceClone = Pick<Race, 'id' | 'name' | 'created_at'>

function normalizeRaceName(name: string) {
  return name.trim().toLowerCase()
}

function getSuggestedRepeatCloneName(sourceName: string, existingNames: string[]) {
  const takenNames = new Set(existingNames.map(normalizeRaceName))
  let cloneNumber = existingNames.length + 1
  let candidate = `${sourceName} (My Plan ${cloneNumber})`

  while (takenNames.has(normalizeRaceName(candidate))) {
    cloneNumber += 1
    candidate = `${sourceName} (My Plan ${cloneNumber})`
  }

  return candidate
}

function formatExistingCloneNames(existingNames: string[]) {
  const namesToShow = existingNames.slice(0, 3)
  if (namesToShow.length === 0) return ''
  const remainingCount = existingNames.length - namesToShow.length
  return remainingCount > 0
    ? `${namesToShow.join(', ')}, and ${remainingCount} more`
    : namesToShow.join(', ')
}

function promptForRepeatCloneName(sourceName: string, existingClones: ExistingRaceClone[]) {
  const existingNames = existingClones.map(clone => clone.name).filter(Boolean)
  const takenNames = new Set(existingNames.map(normalizeRaceName))
  const existingNameSummary = formatExistingCloneNames(existingNames)
  const eventLabel = existingClones.length === 1 ? 'event' : 'events'
  const message = [
    `You already have ${existingClones.length} ${eventLabel} cloned from ${sourceName}.`,
    'You are creating another event. Enter a different name for this clone.',
    existingNameSummary ? `Existing clone names: ${existingNameSummary}` : '',
  ].filter(Boolean).join('\n\n')
  let suggestedName = getSuggestedRepeatCloneName(sourceName, existingNames)

  while (true) {
    const value = window.prompt(message, suggestedName)
    if (value === null) return null

    const trimmed = value.trim()
    if (!trimmed) {
      alert('Enter a name for the new cloned event, or cancel cloning.')
      continue
    }

    if (takenNames.has(normalizeRaceName(trimmed))) {
      alert('That name is already used by one of your cloned events. Enter a different name, or cancel cloning.')
      suggestedName = getSuggestedRepeatCloneName(sourceName, [...existingNames, suggestedName])
      continue
    }

    return trimmed
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown error'
}

// Helper to get icon
function getWaypointIcon(type: string): string {
  switch (type) {
    case 'start': return '🟢'
    case 'finish': return '🏁'
    case 'aid_station': return '➕' // Medical Cross
    case 'water_only': return '💧'
    case 'crew': return '👥'
    case 'pacer': return '🏃'
    case 'drop_bag': return '🎒'
    case 'medical': return '🏥'
    case 'landmark': return '📸'
    default: return '📍'
  }
}

function formatClockTime(value: string | null | undefined, timeZone: string | null | undefined, clock24h: boolean) {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone || undefined,
    hour12: !clock24h,
  })
}

function formatTimeZoneName(value: string | null | undefined, timeZone: string | null | undefined) {
  if (!value || !timeZone) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat([], { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find(part => part.type === 'timeZoneName')?.value ?? ''
}

// Identify redundant terrain nodes that can be merged away so consecutive
// same-type segments collapse into one. A short (<=0.1 mi) "other" gap between
// two matching terrain types is also collapsed.
function getCompactableTerrainNodeIds(nodes: TerrainNode[]) {
  const GAP_TOL = 0.1 + 1e-6
  const sorted = [...nodes].sort((a, b) => a.mile - b.mile)
  const ids = new Set<string>()
  const isKnownTerrain = (node: TerrainNode) => node.type !== 'other' && node.type !== 'default'

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const node = sorted[i]
    if (isKnownTerrain(prev) && node.type === prev.type) ids.add(node.id)
  }

  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1]
    const gap = sorted[i]
    const next = sorted[i + 1]
    if (
      isKnownTerrain(prev) &&
      gap.type === 'other' &&
      next.type === prev.type &&
      next.mile - gap.mile <= GAP_TOL
    ) {
      ids.add(gap.id)
      ids.add(next.id)
    }
  }

  return Array.from(ids)
}

function RoleSwitcher({ raceId, views }: { raceId: string; views: Array<'full' | 'runner' | 'crew' | 'pacer'> }) {
  const uniqueViews = Array.from(new Set(views.length ? views : ['full']))
  if (uniqueViews.length <= 1) return null

  const hrefFor = (view: string) => view === 'full' ? `/race/${raceId}` : `/race/${raceId}/${view}`
  return (
    <div className='flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900 p-1 max-w-[48vw] overflow-x-auto'>
      {uniqueViews.map(view => (
        <Link
          key={view}
          to={hrefFor(view)}
          className='px-2 py-1 rounded text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white capitalize'
        >
          {view}
        </Link>
      ))}
    </div>
  )
}

export function RaceDetail({ raceId }: { raceId: string }) {
  const { user, refreshMemberships } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('live')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingWaypoint, setEditingWaypoint] = useState<Partial<Waypoint> | null>(null)
  const [viewingWaypoint, setViewingWaypoint] = useState<Waypoint | null>(null)

  // Terrain State
  const [terrainNodes, setTerrainNodes] = useState<TerrainNode[]>([])

  const [hoveredMile, setHoveredMile] = useState<number | null>(null)
  const [hoveredWaypointId, setHoveredWaypointId] = useState<string | null>(null)
  const [hoveredTerrainId, setHoveredTerrainId] = useState<string | null>(null)
  // Pending segment: set by map 2-click or profile drag → triggers classification popup.
  // nodeId is set when editing an existing segment (vs defining a new range).
  const [pendingSegment, setPendingSegment] = useState<{ startMile: number; endMile: number; nodeId?: string } | null>(null)
  const [pendingType, setPendingType] = useState<TerrainTypeValue>('single_track')

  const [showMileMarkers, setShowMileMarkers] = useState(true)
  const [fetchingWeather, setFetchingWeather] = useState(false)
  const [isAidListOpen, setIsAidListOpen] = useState(true)
  const [isReimporting, setIsReimporting] = useState(false)

  // Measure the sticky page header so child sticky elements (pace plan thead)
  // can pin directly below it, even when mobile chrome / font scaling shift things.
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!headerEl) return
    const apply = () => {
      document.documentElement.style.setProperty('--page-header-h', `${headerEl.offsetHeight}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(headerEl)
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--page-header-h') }
  }, [headerEl])
  const [isCloning, setIsCloning] = useState(false)

  // Data Fetching
  const { data: race, isLoading: raceLoading, isError: raceLoadFailed } = useQuery({
    queryKey: ['race', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('races').select(RACE_SELECT).eq('id', raceId).single()
      if (error) throw error
      return data as unknown as Race
    }
  })

  const {
    canEdit,
    canEditRaceSettings,
    isAdmin,
    isOwner: hasOwnerMembership,
    isRunner,
    canLogCheckins,
    canManageTeam,
    availableRoleViews,
  } = usePermission(raceId, race?.race_director_user_id)
  const canDeleteRace = hasOwnerMembership || isAdmin || (!!user && race?.user_id === user.id)

  useEffect(() => {
    if (!raceLoading && raceLoadFailed) {
      navigate('/events', { replace: true })
    }
  }, [raceLoading, raceLoadFailed, navigate])

  // Auto-fetch weather if missing — edit-perm only to avoid races and unauthorized writes
  useEffect(() => {
    if (!user || !canEdit) return
    if (race?.location && race?.start_datetime && !race.avg_temp_high && !fetchingWeather) {
      const loc = race.location!
      const date = race.start_datetime!
      const autoFetch = async () => {
        setFetchingWeather(true)
        try {
          const result = await fetchWeatherForRace(loc, date)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('races') as any).update({
            ...result.current,
            weather_history: result.history,
            timezone: result.current.timezone
          }).eq('id', raceId)
          queryClient.invalidateQueries({ queryKey: ['race', raceId] })
        } catch (err) {
          console.error('Auto weather fetch failed:', err)
        } finally {
          setFetchingWeather(false)
        }
      }
      autoFetch()
    }
  }, [race?.location, race?.start_datetime, race?.avg_temp_high, canEdit, raceId, user, fetchingWeather, queryClient])

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data as any
    }
  })
  const clock24h = profile?.clock_24h ?? false
  // Runner pacing profile is per-user (follows the runner across events).
  const userRunnerProfile = parseRunnerProfile(profile?.runner_profile)

  const { data: course } = useQuery({
    queryKey: ['course', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('*').eq('race_id', raceId).single()
      if (error && error.code !== 'PGRST116') throw error
      return data as Course | null
    }
  })

  // Today's weather at the race location (refetched hourly). Kept separate from the
  // race-day forecast so users can compare current conditions to race day.
  const { data: currentWeather } = useQuery({
    queryKey: ['current-weather', race?.location],
    enabled: !!race?.location,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async () => fetchCurrentWeather(race!.location!)
  })

  const { data: waypoints = [], isLoading: waypointsLoading } = useQuery({
    queryKey: ['waypoints', course?.id],
    enabled: !!course?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('waypoints')
        .select('*')
        .eq('course_id', course!.id)
        .order('mile', { ascending: true }) // Changed from order_index to mile
      if (error) throw error
      return data as Waypoint[]
    }
  })

  // Backfill Start/Finish waypoints for courses that don't have them. Older
  // races uploaded before the GPX-import auto-insert fallback existed, or
  // races where the user deleted Start/Finish, still need these two rows so
  // the Aid Stations panel exposes the full waypoint options (cutoff, drop
  // bag, crew, pacer) for them.
  useEffect(() => {
    if (waypointsLoading || !course?.id || !course.geometry || !user) return
    if (!canEdit) return
    const coords = (course.geometry as { coordinates: [number, number][] }).coordinates
    if (!coords || coords.length < 2) return

    const hasStart = waypoints.some(w => w.type === 'start')
    const hasFinish = waypoints.some(w => w.type === 'finish')
    if (hasStart && hasFinish) return

    const totalDist = course.total_distance_miles || 0
    const maxOrder = Math.max(...waypoints.map(w => w.order_index), 0)
    const toInsert: Partial<Waypoint>[] = []
    if (!hasStart) {
      toInsert.push({
        course_id: course.id, name: 'Start', type: 'start',
        lat: coords[0][1], lon: coords[0][0], mile: 0,
        order_index: maxOrder + 1,
        has_drop_bag: false, crew_allowed: false, pacer_allowed: false,
      })
    }
    if (!hasFinish && totalDist > 0) {
      const last = coords[coords.length - 1]
      toInsert.push({
        course_id: course.id, name: 'Finish', type: 'finish',
        lat: last[1], lon: last[0], mile: Math.round(totalDist * 100) / 100,
        order_index: maxOrder + toInsert.length + 1,
        has_drop_bag: false, crew_allowed: false, pacer_allowed: false,
      })
    }
    if (toInsert.length === 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.from('waypoints') as any).insert(toInsert).then(({ error }: { error: unknown }) => {
      if (error) { console.error('Failed to backfill Start/Finish waypoints:', error); return }
      queryClient.invalidateQueries({ queryKey: ['waypoints', course.id] })
    })
  }, [waypointsLoading, course?.id, course?.geometry, course?.total_distance_miles, waypoints, user, canEdit, queryClient])

  // Fetch Terrain Nodes
  useEffect(() => {
    if (!course?.id) return
    const fetchTerrain = async () => {
      const { data } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      if (data) setTerrainNodes(data)
    }
    fetchTerrain()
  }, [course?.id])

  // Merge redundant adjacent same-type terrain nodes in the DB so the course
  // shows single combined segments instead of many short adjacent ones.
  useEffect(() => {
    if (!course?.id || !canEdit || terrainNodes.length === 0) return
    const compactableIds = getCompactableTerrainNodeIds(terrainNodes)
    if (compactableIds.length === 0) return

    let cancelled = false
    const compactTerrain = async () => {
      const { error } = await supabase.from('terrain_nodes').delete().in('id', compactableIds)
      if (error) {
        console.error('Failed to compact terrain nodes:', error)
        return
      }
      const { data } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      if (!cancelled && data) setTerrainNodes(data)
    }
    compactTerrain()
    return () => { cancelled = true }
  }, [course?.id, canEdit, terrainNodes])

  const handleGpxUpload = async (result: GpxParseResult, rawGpx: string) => {
    try {

      // Check for missing elevation data
      if (result.elevationProfile.length === 0) {
        alert('Warning: The uploaded GPX file does not contain elevation data. The elevation profile will be empty.')
      }

      let courseId: string | null = null

      if (course) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('courses') as any).update({
          raw_gpx: rawGpx,
          geometry: { type: 'LineString', coordinates: result.coordinates },
          elevation_samples: result.elevationProfile,
          total_distance_miles: result.stats.totalDistanceMiles,
          total_elevation_gain_ft: result.stats.totalElevationGainFt,
          total_elevation_loss_ft: result.stats.totalElevationLossFt,
          min_elevation_ft: result.stats.minElevationFt,
          max_elevation_ft: result.stats.maxElevationFt,
        }).eq('id', course.id)
        if (error) throw error
        courseId = course.id
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newCourse, error } = await (supabase.from('courses') as any).insert({
          race_id: raceId,
          raw_gpx: rawGpx,
          geometry: { type: 'LineString', coordinates: result.coordinates },
          elevation_samples: result.elevationProfile,
          total_distance_miles: result.stats.totalDistanceMiles,
          total_elevation_gain_ft: result.stats.totalElevationGainFt,
          total_elevation_loss_ft: result.stats.totalElevationLossFt,
          min_elevation_ft: result.stats.minElevationFt,
          max_elevation_ft: result.stats.maxElevationFt,
        }).select('id').single()
        if (error) throw error
        courseId = newCourse?.id || null
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('races') as any).update({ distance_miles: result.stats.totalDistanceMiles }).eq('id', raceId)

      // Import GPX waypoints as aid stations if present
      if (result.waypoints.length > 0 && courseId && result.coordinates.length > 0) {
        try {
          // On re-import: ask whether to replace existing waypoints. Otherwise the GPX waypoints
          // would be appended on top, producing duplicates.
          let replaceExisting = true
          if (waypoints.length > 0) {
            replaceExisting = confirm(
              `This GPX contains ${result.waypoints.length} waypoints. Replace the ${waypoints.length} existing waypoints (cutoffs, drop bags, notes will be lost)?\n\nOK = replace, Cancel = keep existing and skip GPX waypoints.`
            )
            if (!replaceExisting) {
              queryClient.invalidateQueries({ queryKey: ['course', raceId] })
              queryClient.invalidateQueries({ queryKey: ['race', raceId] })
              queryClient.invalidateQueries({ queryKey: ['waypoints', courseId] })
              setIsReimporting(false)
              return
            }
            const { error: delErr } = await supabase.from('waypoints').delete().eq('course_id', courseId)
            if (delErr) throw delErr
          }

          const maxOrder = replaceExisting ? 0 : Math.max(...waypoints.map(w => w.order_index), 0)
          const totalDist = result.stats.totalDistanceMiles

          type Candidate = {
            course_id: string
            name: string
            type: string
            lat: number
            lon: number
            mile: number
            has_drop_bag: boolean
            crew_allowed: boolean
            pacer_allowed: boolean
          }

          const candidates: Candidate[] = result.waypoints.flatMap((wpt, i) => {
            const name = wpt.name || `Aid Station ${i + 1}`
            const lower = name.toLowerCase()

            if (lower.includes('start & finish') || lower.includes('start/finish')) {
              // Prefer the actual route endpoints for start/finish rather than whatever
              // the GPX <wpt> coordinates say.
              const first = result.coordinates[0]
              const last = result.coordinates[result.coordinates.length - 1]
              return [
                { course_id: courseId, name: 'Start', type: 'start', lat: first[1], lon: first[0], mile: 0, has_drop_bag: false, crew_allowed: false, pacer_allowed: false },
                { course_id: courseId, name: 'Finish', type: 'finish', lat: last[1], lon: last[0], mile: Math.round(totalDist * 100) / 100, has_drop_bag: false, crew_allowed: false, pacer_allowed: false },
              ]
            }

            // Detect out-and-back / loops: if the route passes near this waypoint
            // at more than one point, emit a row per visit.
            const visits = getAllVisitsOnLine({ lat: wpt.lat, lon: wpt.lon }, result.coordinates)

            let type = 'aid_station'
            if (lower === 'start') type = 'start'
            if (lower === 'finish') type = 'finish'

            if (visits.length >= 2) {
              return visits.map(v => ({
                course_id: courseId,
                name: `${name} (mi ${Math.round(v.mile)})`,
                type,
                lat: v.lat,
                lon: v.lon,
                mile: Math.round(v.mile * 100) / 100,
                has_drop_bag: false,
                crew_allowed: false,
                pacer_allowed: false,
              }))
            }

            // Single visit — fall back to the lenient 2-mile snap so waypoints
            // placed slightly off-route still land somewhere sensible.
            const nearest = getNearestPointOnLine({ lat: wpt.lat, lon: wpt.lon }, result.coordinates)
            let mile = 0
            let lat = wpt.lat
            let lon = wpt.lon
            if (visits.length === 1) {
              mile = visits[0].mile
              lat = visits[0].lat
              lon = visits[0].lon
            } else if (nearest && nearest.distance < 2) {
              mile = getDistanceFromStart(result.coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })
              lat = nearest.lat
              lon = nearest.lon
            }

            return [{
              course_id: courseId,
              name,
              type,
              lat,
              lon,
              mile: Math.round(mile * 100) / 100,
              has_drop_bag: false,
              crew_allowed: false,
              pacer_allowed: false,
            }]
          })

          const hasStart = candidates.some(w => w.type === 'start') || waypoints.some(w => w.type === 'start')
          const hasFinish = candidates.some(w => w.type === 'finish') || waypoints.some(w => w.type === 'finish')

          if (!hasStart && result.coordinates.length > 0) {
            candidates.push({
              course_id: courseId,
              name: 'Start',
              type: 'start',
              lat: result.coordinates[0][1],
              lon: result.coordinates[0][0],
              mile: 0,
              has_drop_bag: false, crew_allowed: false, pacer_allowed: false,
            })
          }
          if (!hasFinish && result.coordinates.length > 0) {
            const last = result.coordinates[result.coordinates.length - 1]
            candidates.push({
              course_id: courseId,
              name: 'Finish',
              type: 'finish',
              lat: last[1],
              lon: last[0],
              mile: Math.round(totalDist * 100) / 100,
              has_drop_bag: false, crew_allowed: false, pacer_allowed: false,
            })
          }

          candidates.sort((a, b) => a.mile - b.mile)
          const waypointsToInsert = candidates.map((c, idx) => ({ ...c, order_index: maxOrder + idx + 1 }))

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: wpError } = await (supabase.from('waypoints') as any).insert(waypointsToInsert)
          if (wpError) console.error('Failed to import GPX waypoints:', wpError)
        } catch (wpErr) {
          console.error('Error importing GPX waypoints:', wpErr)
        }
      }

      queryClient.invalidateQueries({ queryKey: ['course', raceId] })
      queryClient.invalidateQueries({ queryKey: ['race', raceId] })
      queryClient.invalidateQueries({ queryKey: ['waypoints', courseId] })
      setIsReimporting(false)
    } catch (err) {
      console.error('Failed to save course:', err)
      alert('Failed to save course')
    }
  }

  const handleSaveWaypoint = async (data: Partial<Waypoint>) => {
    try {
      if (data.id) {
        // Recalculate lat/lon if mile was changed
        let lat = data.lat
        let lon = data.lon
        const existingWp = waypoints.find(w => w.id === data.id)
        if (existingWp && data.mile !== undefined && data.mile !== existingWp.mile && course?.geometry) {
          const coords = (course.geometry as { coordinates: [number, number][] }).coordinates
          const coord = getCoordinateAtDistance(course.geometry as any, data.mile * 1609.34)
          if (coord) {
            const snapped = getNearestPointOnLine({ lat: coord[1], lon: coord[0] }, coords)
            if (snapped) {
              lon = snapped.lon
              lat = snapped.lat
            } else {
              lon = coord[0]
              lat = coord[1]
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('waypoints') as any).update({
          name: data.name,
          type: data.type,
          mile: data.mile,
          lat: lat ?? data.lat,
          lon: lon ?? data.lon,
          cutoff_time: data.cutoff_time || null,
          has_drop_bag: data.has_drop_bag,
          crew_allowed: data.crew_allowed,
          pacer_allowed: data.pacer_allowed,
          notes: data.notes,
          drop_bag_notes: data.drop_bag_notes || null,
          crew_relay_notes: data.crew_relay_notes || null,
          runner_next_leg_notes: data.runner_next_leg_notes || null
        }).eq('id', data.id)
        if (error) throw error
      } else {
        const maxOrder = Math.max(...waypoints.map(w => w.order_index), 0)

        // If we have a mile, calculate lat/lon from the course geometry
        let lat = data.lat
        let lon = data.lon

        if (data.mile !== undefined && course?.geometry) {
          const coords = (course.geometry as { coordinates: [number, number][] }).coordinates
          // Use turf/along to get approximate position at target mile
          const coord = getCoordinateAtDistance(course.geometry as any, data.mile * 1609.34)
          if (coord) {
            // Snap to nearest point on the actual route line for exact positioning
            const snapped = getNearestPointOnLine({ lat: coord[1], lon: coord[0] }, coords)
            if (snapped) {
              lon = snapped.lon
              lat = snapped.lat
            } else {
              lon = coord[0]
              lat = coord[1]
            }
          } else {
            throw new Error(`Could not calculate location for mile ${data.mile}. Ensure it is within the course distance.`)
          }
        }

        if (lat === undefined || lon === undefined) {
          throw new Error('Latitude and Longitude are required. Please enter a valid mile or click on the map.')
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('waypoints') as any).insert({
          course_id: course?.id,
          name: data.name,
          type: data.type,
          lat: lat,
          lon: lon,
          mile: data.mile,
          order_index: maxOrder + 1,
          cutoff_time: data.cutoff_time || null,
          has_drop_bag: data.has_drop_bag,
          crew_allowed: data.crew_allowed,
          pacer_allowed: data.pacer_allowed,
          notes: data.notes,
          drop_bag_notes: data.drop_bag_notes || null,
          crew_relay_notes: data.crew_relay_notes || null,
          runner_next_leg_notes: data.runner_next_leg_notes || null
        })
        if (error) throw error
      }
      setEditingWaypoint(null)
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch (err: any) {
      console.error('Error saving waypoint:', err)
      alert(`Failed to save waypoint: ${err.message || 'Unknown error'}`)
    }
  }

  const handleDeleteWaypoint = async (id: string) => {
    if (!confirm('Are you sure you want to delete this waypoint?')) return
    try {
      const { error } = await supabase.from('waypoints').delete().eq('id', id)
      if (error) throw error
      setEditingWaypoint(null)
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch (err) {
      console.error('Error deleting waypoint:', err)
    }
  }

  const [isWaypointEditMode, setIsWaypointEditMode] = useState(false)
  const [isTerrainEditMode, setIsTerrainEditMode] = useState(false)

  // Map Interactions
  const handleMapClick = (lat: number, lon: number, type?: string) => {
    if (!course?.geometry) return
    const coordinates = (course.geometry as { coordinates: [number, number][] }).coordinates
    if (!coordinates || coordinates.length === 0) return

    const nearest = getNearestPointOnLine({ lat, lon }, coordinates)

    // Default: Add Waypoint
    if (nearest && nearest.distance < 0.5) {
      const mile = getDistanceFromStart(coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })
      setEditingWaypoint({
        course_id: course.id,
        lat: nearest.lat,
        lon: nearest.lon,
        mile: mile,
        type: type || 'aid_station'
      })
    } else if (nearest) {
      // Optional: helpful to tell user if they are too far
      // console.warn('Click too far from route:', nearest.distance)
    }
  }

  // Handle Drag & Drop of Waypoints
  const handleWaypointMove = async (id: string, lat: number, lon: number, mile: number) => {
    // Optimistic update: update cache immediately so marker recreation uses new position
    queryClient.setQueryData(['waypoints', course?.id], (old: Waypoint[] | undefined) => {
      if (!old) return old
      return old.map(wp => wp.id === id ? { ...wp, lat, lon, mile } : wp)
    })

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('waypoints') as any)
        .update({ lat, lon, mile })
        .eq('id', id)
        .select('id')
        .single()

      if (error) throw error

      // Revalidate to ensure server state matches
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch (err) {
      // Rollback on error
      console.error('Failed to move waypoint:', err)
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
      alert(`Failed to move waypoint: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Update only a waypoint's aid-station stop duration (minutes). Passing null
  // clears the override so the race default applies. Used by the Pace Plan
  // aid-station stops panel.
  const handleUpdateWaypointDelay = async (id: string, delay: number | null) => {
    queryClient.setQueryData(['waypoints', course?.id], (old: Waypoint[] | undefined) =>
      old ? old.map(wp => wp.id === id ? { ...wp, delay } : wp) : old
    )
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('waypoints') as any).update({ delay }).eq('id', id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch {
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
      alert('Failed to update aid station time')
    }
  }


  const clearPendingTerrainSegment = () => {
    setPendingSegment(null)
    setHoveredTerrainId(null)
  }

  const getRoutePointForMile = (mile: number) => {
    let lat = 0
    let lon = 0
    if (course?.geometry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coord = getCoordinateAtDistance(course.geometry as any, mile * 1609.34)
      if (coord) {
        lon = coord[0]
        lat = coord[1]
      }
    }
    return { lat, lon }
  }

  const refreshAndCompactTerrainNodes = async () => {
    if (!course?.id) return

    const { data: savedNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
    const compactableIds = savedNodes ? getCompactableTerrainNodeIds(savedNodes as TerrainNode[]) : []
    if (compactableIds.length > 0) {
      const { error } = await supabase.from('terrain_nodes').delete().in('id', compactableIds)
      if (error) throw error
    }

    const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
    if (tNodes) setTerrainNodes(tNodes)
  }

  // Select an existing terrain segment for editing (from sidebar pencil or map click).
  const handleEditTerrainSegment = (id: string, segmentEndMile?: number) => {
    const sorted = [...terrainNodes].sort((a, b) => a.mile - b.mile)
    const index = sorted.findIndex(n => n.id === id)
    const node = sorted[index]
    if (!node) return

    const endMile = segmentEndMile ?? sorted[index + 1]?.mile ?? course?.total_distance_miles ?? node.mile
    if (endMile <= node.mile) return

    setPendingType((node.type === 'other' ? 'single_track' : node.type) as TerrainTypeValue)
    setPendingSegment({ startMile: node.mile, endMile, nodeId: node.id })
    setHoveredTerrainId(node.id)
  }

  const handleUpdateTerrainSegment = async (
    segment: { startNodeId: string; endNodeId?: string; nodeIds: string[]; startMile: number; endMile: number },
    startMile: number,
    endMile: number,
    type: TerrainTypeValue,
    difficulty: number
  ) => {
    if (!course?.id) return

    const totalDistance = course.total_distance_miles ?? endMile
    if (startMile < 0 || endMile <= startMile || endMile > totalDistance + 0.01) {
      throw new Error('Invalid segment mileage')
    }

    const { data, error: loadError } = await supabase
      .from('terrain_nodes')
      .select('*')
      .eq('course_id', course.id)
      .order('mile')
    if (loadError) throw loadError

    const latestNodes = (data ?? []) as TerrainNode[]
    const sorted = [...latestNodes].sort((a, b) => a.mile - b.mile)
    const EPS = 0.005

    const terrainAfter = (mile: number) => {
      let active: { type: string; difficulty: number } = { type: 'other', difficulty: 100 }
      for (const node of sorted) {
        if (node.mile <= mile + EPS) active = { type: node.type, difficulty: node.difficulty ?? 100 }
        else break
      }
      return active
    }

    const oldSegmentEndsAtFinish = segment.endMile >= totalDistance - EPS
    const afterOldEnd = oldSegmentEndsAtFinish
      ? { type: 'other', difficulty: 100 }
      : terrainAfter(segment.endMile + EPS)
    const restoreAtEnd = endMile < segment.endMile - EPS
      ? afterOldEnd
      : terrainAfter(endMile + EPS)

    const idsToDelete = new Set(segment.nodeIds)
    for (const node of latestNodes) {
      const insideNewRange = node.mile > startMile + EPS && node.mile < endMile - EPS
      const onNewStart = Math.abs(node.mile - startMile) <= EPS
      const onNewEnd = Math.abs(node.mile - endMile) <= EPS
      if (insideNewRange || onNewStart || onNewEnd) idsToDelete.add(node.id)
    }

    if (idsToDelete.size > 0) {
      const { error } = await supabase.from('terrain_nodes').delete().in('id', Array.from(idsToDelete))
      if (error) throw error
    }

    const startPoint = getRoutePointForMile(startMile)
    const rows = [{
      course_id: course.id,
      mile: startMile,
      type,
      difficulty,
      lat: startPoint.lat,
      lon: startPoint.lon,
    }]

    if (endMile < totalDistance - EPS) {
      const endPoint = getRoutePointForMile(endMile)
      rows.push({
        course_id: course.id,
        mile: endMile,
        type: restoreAtEnd.type as TerrainTypeValue,
        difficulty: restoreAtEnd.difficulty,
        lat: endPoint.lat,
        lon: endPoint.lon,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase.from('terrain_nodes') as any).insert(rows)
    if (insertError) throw insertError

    await refreshAndCompactTerrainNodes()
    clearPendingTerrainSegment()
  }

  const handleDeleteTerrainSegmentRange = async (
    segment: { startNodeId: string; endNodeId?: string; nodeIds: string[]; startMile: number; endMile: number }
  ) => {
    await handleUpdateTerrainSegment(segment, segment.startMile, segment.endMile, 'other', 100)
  }

  const handleDeleteTerrainSegment = async (id: string) => {
    const sorted = [...terrainNodes].sort((a, b) => a.mile - b.mile)
    const index = sorted.findIndex(n => n.id === id)
    const node = sorted[index]
    if (!node) return
    const endMile = sorted[index + 1]?.mile ?? course?.total_distance_miles ?? node.mile
    if (endMile <= node.mile) return

    clearPendingTerrainSegment()
    await handleDeleteTerrainSegmentRange({
      startNodeId: id,
      nodeIds: [id],
      startMile: node.mile,
      endMile,
    })
  }

  // Handle saving a range/segment of terrain
  const handleSaveTerrainSegment = async (startMile: number, endMile: number, type: string, difficulty: number) => {
    try {
      if (!course?.id) return

      const helperInsert = async (mile: number, t: string, d: number) => {
        let lat = 0, lon = 0
        if (course.geometry) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const coord = getCoordinateAtDistance(course.geometry as any, mile * 1609.34)
          if (coord) {
            lat = coord[1]
            lon = coord[0]
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('terrain_nodes') as any).insert({
          course_id: course.id,
          mile,
          type: t,
          difficulty: d,
          lat,
          lon
        })
        if (error) throw error
      }

      // Logic:
      // 1. We are defining the segment [start, end) as 'type'.
      // 2. We need a Node at 'start' with 'type'.
      // 3. We need to preserve the terrain type that comes AFTER 'end'.
      //    This means we need a Node at 'end' with 'typeAtEnd'.
      //    'typeAtEnd' is whatever type covers the 'end' mile currently.

      // Helper to find current type at a given mile
      const getTerrainAt = (m: number) => {
        const sorted = [...terrainNodes].sort((a, b) => a.mile - b.mile)
        // Find last node <= m
        // Canvas Logic: If no node is before m, or the last node before m is 'other' (Undefined),
        // then the terrain at m is 'Undefined'.
        let active = sorted[0]

        // If course starts with explicit node at 0, use it. Otherwise default is Undefined (other).
        if (!active || active.mile > m) return { type: 'other', difficulty: 100 }

        for (const node of sorted) {
          if (node.mile <= m + 0.01) active = node
          else break
        }
        return { type: active.type, difficulty: active.difficulty }
      }

      // Logic:
      // We are painting a segment [start, end) with 'type'.
      // 1. Set Start Node = type.
      // 2. Set End Node = ???
      //    - If getTerrainAt(endMile) returns a Type != Paved, it means we are inside a segment.
      //      We should probably restore THAT type to maintain continuity of the *other* segment.
      //    - If getTerrainAt(endMile) returns Paved, we restore Paved.

      const prevAtEnd = getTerrainAt(endMile)

      const typeAtEnd = prevAtEnd.type
      const diffAtEnd = prevAtEnd.difficulty


      // Snap tolerance: ~0.1mi (~160m). Wider than insert dedupe so adjacent
      // paints bridge automatically (no thin "default" sliver between segments).
      const SNAP_TOL = 0.1

      // A. Insert/Update Start Node
      const existingStart = terrainNodes.find(n => Math.abs(n.mile - startMile) < SNAP_TOL)
      if (existingStart) {
        const { error } = await (supabase.from('terrain_nodes') as any).update({ type, difficulty }).eq('id', existingStart.id)
        if (error) throw error
      } else {
        await helperInsert(startMile, type, difficulty)
      }

      // B. Insert/Update End Node (Restore previous state)
      if (endMile < (course.total_distance_miles || 100)) {
        const existingEnd = terrainNodes.find(n => Math.abs(n.mile - endMile) < SNAP_TOL)
        if (!existingEnd) {
          await helperInsert(endMile, typeAtEnd, diffAtEnd)
        }
      }

      // C. Delete Intermediate Nodes (they are overridden by this new segment)
      // Nodes strictly between start and end (outside snap tolerance of either)
      const nodesToDelete = terrainNodes.filter(n => n.mile > (startMile + SNAP_TOL) && n.mile < (endMile - SNAP_TOL))
      if (nodesToDelete.length > 0) {
        await supabase.from('terrain_nodes').delete().in('id', nodesToDelete.map(n => n.id))
      }

      // Refresh and compact redundant same-type boundaries so adjacent matching
      // segments collapse into one. Unknown gaps only collapse when they are
      // 0.1 mi or shorter between matching terrain types.
      const { data: savedNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      const compactableIds = savedNodes ? getCompactableTerrainNodeIds(savedNodes as TerrainNode[]) : []
      if (compactableIds.length > 0) {
        const { error } = await supabase.from('terrain_nodes').delete().in('id', compactableIds)
        if (error) throw error
      }

      const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      if (tNodes) setTerrainNodes(tNodes)

    } catch (err: any) {
      console.error('Error saving terrain segment:', err)
      alert(`Failed to save segment: ${err.message || JSON.stringify(err)}`)
    }
  }

  // For a picked mile range, find OTHER physical passes of the same trail
  // (out-and-backs, lollipop stems, repeated loops). Returns mile ranges that
  // should also be painted with the same terrain.
  const findParallelMileRanges = (startMile: number, endMile: number): [number, number][] => {
    if (coordinates.length < 2) return []
    const lo = Math.min(startMile, endMile)
    const hi = Math.max(startMile, endMile)

    // Convert mile bounds to coord index bounds.
    // getDistanceFromStart returns miles; walk array until cumulative reaches lo/hi.
    let cum = 0
    let iLo = 0
    let iHi = coordinates.length - 1
    let foundLo = false
    for (let i = 1; i < coordinates.length; i++) {
      const d = getDistance(coordinates[i - 1][1], coordinates[i - 1][0], coordinates[i][1], coordinates[i][0])
      cum += d
      if (!foundLo && cum >= lo) { iLo = i; foundLo = true }
      if (cum >= hi) { iHi = i; break }
    }
    if (iLo >= iHi) return []

    const TOL_M = 25
    const TOL_DEG = TOL_M / 111000
    const TOL_DEG_SQ = TOL_DEG * TOL_DEG

    const matched = new Set<number>()
    for (let i = iLo; i <= iHi; i++) {
      const [loni, lati] = coordinates[i]
      const cosLat = Math.cos(lati * Math.PI / 180)
      for (let j = 0; j < coordinates.length; j++) {
        if (j >= iLo && j <= iHi) continue
        if (matched.has(j)) continue
        const [lonj, latj] = coordinates[j]
        const dy = lati - latj
        const dx = (loni - lonj) * cosLat
        if (dx * dx + dy * dy <= TOL_DEG_SQ) matched.add(j)
      }
    }

    if (matched.size === 0) return []

    // Group contiguous matched indices, bridge small gaps.
    const arr = Array.from(matched).sort((a, b) => a - b)
    const GAP = 4
    const indexRanges: [number, number][] = []
    let s = arr[0], e = arr[0]
    for (let k = 1; k < arr.length; k++) {
      if (arr[k] - e <= GAP) e = arr[k]
      else { indexRanges.push([s, e]); s = arr[k]; e = arr[k] }
    }
    indexRanges.push([s, e])

    return indexRanges.map(([a, b]) => {
      const mA = getDistanceFromStart(coordinates, a, { lat: coordinates[a][1], lon: coordinates[a][0] })
      const mB = getDistanceFromStart(coordinates, b, { lat: coordinates[b][1], lon: coordinates[b][0] })
      return [Math.min(mA, mB), Math.max(mA, mB)] as [number, number]
    }).filter(([a, b]) => b - a >= 0.05)
  }

  // Confirm the pending segment popup → paint primary range + any parallel passes.
  const confirmPendingSegment = async () => {
    if (!pendingSegment) return
    const { startMile, endMile } = pendingSegment
    const t = pendingType
    const diff = getTerrainDefaultDifficulty(t)
    clearPendingTerrainSegment()

    await handleSaveTerrainSegment(startMile, endMile, t, diff)

    const parallels = findParallelMileRanges(startMile, endMile)
    for (const [a, b] of parallels) {
      await handleSaveTerrainSegment(a, b, t, diff)
    }
  }

  const handleExportGpx = () => {
    if (!course?.raw_gpx || !race) {
      alert('No GPX data available to export.')
      return
    }

    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(course.raw_gpx, 'application/xml')

      const wpts = doc.querySelectorAll('wpt')
      wpts.forEach(wpt => wpt.parentNode?.removeChild(wpt))

      const root = doc.documentElement
      waypoints.forEach(wp => {
        const wptEl = doc.createElement('wpt')
        wptEl.setAttribute('lat', wp.lat.toString())
        wptEl.setAttribute('lon', wp.lon.toString())

        const nameEl = doc.createElement('name')
        nameEl.textContent = wp.name
        wptEl.appendChild(nameEl)

        const descEl = doc.createElement('desc')
        descEl.textContent = `Mile ${wp.mile.toFixed(2)} - ${wp.type.replace('_', ' ')}`
        if (wp.notes) {
          descEl.textContent += `\n${wp.notes}`
        }
        wptEl.appendChild(descEl)

        const typeEl = doc.createElement('type')
        typeEl.textContent = wp.type
        wptEl.appendChild(typeEl)

        const firstTrk = doc.querySelector('trk, rte')
        if (firstTrk) {
          root.insertBefore(wptEl, firstTrk)
        } else {
          root.appendChild(wptEl)
        }
      })

      const serializer = new XMLSerializer()
      const newGpxString = serializer.serializeToString(doc)

      const blob = new Blob([newGpxString], { type: 'application/gpx+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${race.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.gpx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error generating GPX:', err)
      alert('Failed to generate GPX file.')
    }
  }

  const handleCloneRace = async () => {
    if (!user) {
      alert('You must be logged in to clone a race.')
      return
    }

    setIsCloning(true)
    try {
      const { data: existingClones, error: existingClonesError } = await supabase
        .from('races')
        .select('id, name, created_at')
        .eq('user_id', user.id)
        .eq('official_source_race_id', raceId)
        .order('created_at', { ascending: false })

      if (existingClonesError) throw existingClonesError

      let repeatCloneName: string | null = null
      if ((existingClones ?? []).length > 0) {
        repeatCloneName = promptForRepeatCloneName(race?.name ?? 'this race', (existingClones ?? []) as ExistingRaceClone[])
        if (!repeatCloneName) return
      } else if (!confirm('Are you sure you want to clone this public race to your account?')) {
        return
      }

      const { data: newRaceId, error } = await supabase.rpc('clone_race', { p_race_id: raceId })
      if (error) throw error

      if (newRaceId) {
        if (repeatCloneName) {
          const { error: renameError } = await supabase
            .from('races')
            .update({ name: repeatCloneName })
            .eq('id', newRaceId)

          if (renameError) {
            console.error('Error renaming cloned race:', renameError)
            alert(`Race was cloned, but the custom name could not be saved: ${renameError.message}`)
          }
        }
        await refreshMemberships?.()
        await queryClient.invalidateQueries({ queryKey: ['races'] })
        navigate(`/race/${newRaceId}`)
      }
    } catch (err: unknown) {
      console.error('Error cloning race:', err)
      alert(`Failed to clone race: ${getErrorMessage(err)}`)
    } finally {
      setIsCloning(false)
    }
  }

  const handleMarkOfficial = async () => {
    if (!race || !isAdmin) return
    const { error } = await supabase
      .from('races')
      .update({
        is_official: true,
        official_at: new Date().toISOString(),
        race_director_user_id: race.user_id,
      })
      .eq('id', race.id)
    if (error) {
      alert(`Failed to mark official: ${error.message}`)
      return
    }
    await supabase
      .from('race_memberships')
      .update({ is_runner: false, is_crew: false, is_pacer: false })
      .eq('race_id', race.id)
      .eq('user_id', race.user_id)
    queryClient.invalidateQueries({ queryKey: ['race', raceId] })
  }

  const handleClearOfficial = async () => {
    if (!race || !isAdmin) return
    if (!confirm('Remove official status from this event?')) return
    const { error } = await supabase
      .from('races')
      .update({
        is_official: false,
        official_at: null,
        race_director_user_id: null,
      })
      .eq('id', race.id)
    if (error) {
      alert(`Failed to update official status: ${error.message}`)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['race', raceId] })
  }

  // Derived State
  const coordinates = (course?.geometry as { coordinates?: [number, number][] })?.coordinates || []
  const elevationProfile = (course?.elevation_samples as { distance: number; elevation: number }[]) || []
  const sampledProfile = sampleElevationProfile(elevationProfile, 200)

  // Memoize waypoints for CourseMap to prevent marker teardown/rebuild on every render
  const courseMapWaypoints = useMemo(() =>
    waypoints.map(wp => ({
      id: wp.id,
      name: wp.name,
      lat: wp.lat,
      lon: wp.lon,
      mile: wp.mile,
      type: wp.type,
      has_drop_bag: wp.has_drop_bag ?? undefined,
      crew_allowed: wp.crew_allowed ?? undefined,
      pacer_allowed: wp.pacer_allowed ?? undefined
    })),
    [waypoints]
  )
  const tabs: { id: Tab; label: string }[] = [
    { id: 'live', label: 'Live' },
    { id: 'overview', label: 'Overview' },
    { id: 'map', label: 'Map & Aid Stations' },
    { id: 'plan', label: 'Pace Plan' },
    { id: 'drop_bags', label: 'Drop Bags' },
    { id: 'resources', label: 'Resources' },
    { id: 'crew', label: 'Crew' },
    ...(canManageTeam ? [{ id: 'members' as Tab, label: 'Members' }] : []),
  ]

  const twilight = useMemo(() => {
    if (!race?.start_datetime || waypoints.length === 0) return null
    const wp = waypoints[0]
    if (wp.lat === undefined || wp.lon === undefined) return null

    const date = new Date(race.start_datetime)
    const times = SunCalc.getTimes(date, wp.lat, wp.lon)

    const formatTime = (d: Date) => d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: race.timezone || undefined,
      hour12: !clock24h
    })

    if (times.dawn && times.dusk) {
      return { dawn: formatTime(times.dawn), dusk: formatTime(times.dusk) }
    }
    return null
  }, [race?.start_datetime, race?.timezone, waypoints, clock24h])

  // Legacy alias: existing usage gates full race editing. New crew/pacer
  // role flags do not grant this; they get logging-only permissions.
  const isOwner = canEdit

  if (raceLoading) return <div className='p-8 text-white'>Loading race...</div>
  if (raceLoadFailed || !race) return <div className='p-8 text-white'>Redirecting...</div>

  return (
    <div className='min-h-screen bg-neutral-950 flex flex-col'>
      {/* Header */}
      <header ref={setHeaderEl} className='print:hidden border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-[100]'>
        <div className='max-w-7xl mx-auto px-3 sm:px-4 py-1.5 sm:py-2 flex justify-between items-center gap-2'>
          <div className='flex items-center gap-1 sm:gap-8 min-w-0 flex-1'>
            <Link to='/events' className='flex items-center hover:opacity-80 transition-opacity cursor-pointer pointer-events-auto relative z-[999] -space-x-3 shrink-0'>
              <img src="/logo.png" alt="DFIU Logo" className="h-10 sm:h-14 w-auto object-contain drop-shadow-md relative z-10" />
              <div className="hidden sm:flex flex-col justify-center items-start">
                <span className="font-black italic tracking-tighter text-4xl uppercase bg-gradient-to-br from-orange-400 to-orange-600 bg-clip-text text-transparent pr-1 relative z-0 leading-[0.8]">DFIU</span>
                <span className="text-neutral-400 text-[9px] font-bold tracking-[0.15em] uppercase opacity-70 -ml-0.5">Don't F* It Up!</span>
              </div>
            </Link>

            <div className="flex sm:hidden flex-col min-w-0 flex-1 leading-tight">
              <div className='flex items-center gap-1.5 min-w-0'>
                <h1 className='text-base font-bold text-white truncate'>{race.name}</h1>
                {race.is_official && <CheckCircle2 className='w-4 h-4 text-blue-400 shrink-0' aria-label='Official event' />}
                {isOwner && (
                  <button onClick={() => setShowEditModal(true)} className='text-neutral-400 hover:text-white text-sm shrink-0'>
                    ✎
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                {race.start_datetime && (
                  <div className='font-medium flex items-center gap-1'>
                    <Calendar className="w-3 h-3" />
                    {formatDate(race.start_datetime, 'MMM d, yyyy')}
                  </div>
                )}
                {race.distance_miles && (
                  <div className='text-blue-500 font-medium'>
                    {race.distance_miles.toFixed(1)} mi
                  </div>
                )}
              </div>
            </div>

            <div className="hidden sm:flex flex-col gap-1">
              <div className='flex items-center gap-2'>
                <h1 className='text-xl font-bold text-white'>{race.name}</h1>
                {race.is_official && <CheckCircle2 className='w-5 h-5 text-blue-400' aria-label='Official event' />}
                {isOwner && (
                  <button onClick={() => setShowEditModal(true)} className='text-neutral-400 hover:text-white'>
                    ✎
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                {race.start_datetime && (
                  <div className='text-neutral-400 font-medium flex items-center gap-1'>
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(race.start_datetime, 'MMM d, yyyy')}
                  </div>
                )}
                {race.distance_miles && (
                  <div className='text-blue-500 font-medium'>
                    {race.distance_miles.toFixed(1)} mi
                  </div>
                )}
              </div>
            </div>

          </div>
          <div className='flex items-center gap-2 sm:gap-4'>
            <RoleSwitcher raceId={raceId} views={race.is_official ? ['full'] : availableRoleViews} />
            {canManageTeam && (
              <button
                onClick={() => setActiveTab('members')}
                className='flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-sm font-medium rounded-lg border border-neutral-800 transition-colors'
                title='Share event'
              >
                <Share2 className='w-4 h-4' />
                <span className='hidden sm:inline'>Share</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={race.is_official ? handleClearOfficial : handleMarkOfficial}
                className='hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-800 bg-blue-950/40 text-blue-200 hover:bg-blue-900/50 text-xs font-medium'
              >
                <CheckCircle2 className='w-3.5 h-3.5' />
                {race.is_official ? 'Official' : 'Make official'}
              </button>
            )}
            {user && !isOwner && race.is_public && (
              <button
                onClick={handleCloneRace}
                disabled={isCloning}
                title="Clone Race"
                className="flex items-center gap-2 p-1.5 sm:px-3 sm:py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isCloning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span className="hidden sm:inline">Clone Race</span>
              </button>
            )}
            {user ? (
              <Link to="/settings" className="flex items-center gap-3 hover:bg-neutral-900 rounded-lg p-1 sm:p-2 transition-colors group">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-white group-hover:text-orange-500 transition-colors">
                    {profile?.name || 'User'}
                  </div>
                </div>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-neutral-700 object-cover" />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-400 group-hover:border-orange-500/50 transition-colors">
                    {(profile?.name?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <Settings className="hidden sm:block w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" />
              </Link>
            ) : (
              <Link to="/login" className="text-sm font-medium text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Modals */}
      {showEditModal && (
        <EditRaceModal
          race={race}
          onClose={() => setShowEditModal(false)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['race', raceId] })
          }}
          onDelete={canDeleteRace ? async () => {
            try {
              const { error } = await supabase.rpc('delete_race', { p_race_id: race.id })
              if (error) throw error

              await refreshMemberships?.()
              await queryClient.invalidateQueries({ queryKey: ['races'] })
              navigate('/dashboard', { replace: true })
            } catch (err) {
              console.error('Failed to delete race:', err)
              alert(`Failed to delete race: ${getErrorMessage(err)}`)
            }
          } : undefined}
        />
      )}

      {editingWaypoint && (
        <EditWaypointModal
          waypoint={editingWaypoint.id ? editingWaypoint : undefined}
          lat={editingWaypoint.lat}
          lon={editingWaypoint.lon}
          mile={editingWaypoint.mile}
          raceDate={race.start_datetime}
          timeZone={race.timezone || undefined}
          onClose={() => setEditingWaypoint(null)}
          onSave={handleSaveWaypoint}
          onDelete={handleDeleteWaypoint}
        />
      )}

      {viewingWaypoint && (
        <ViewWaypointModal
          waypoint={viewingWaypoint}
          isOwner={isOwner}
          timeZone={race.timezone || undefined}
          clock24h={clock24h}
          onClose={() => setViewingWaypoint(null)}
          onEdit={() => {
            setViewingWaypoint(null)
            setEditingWaypoint(viewingWaypoint)
          }}
        />
      )}

      {/* Tabs */}
      <nav
        aria-label='Race sections'
        className='print:hidden sticky z-[90] border-y border-neutral-700 bg-neutral-900/95 shadow-lg shadow-black/20 backdrop-blur-sm'
        style={{ top: 'var(--page-header-h, 0px)' }}
      >
        <div className='max-w-7xl mx-auto px-2 sm:px-4'>
          <div className='relative'>
            <div className='pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-neutral-900 to-transparent sm:hidden' />
            <div className='pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-neutral-900 to-transparent' />
            <div role='tablist' className='flex gap-2 overflow-x-auto whitespace-nowrap py-2 pr-8 [-webkit-overflow-scrolling:touch] [scrollbar-color:#525252_transparent] [scrollbar-width:thin]'>
              {tabs.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type='button'
                    role='tab'
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`shrink-0 rounded-md border px-3.5 py-2 text-[15px] sm:text-sm font-semibold transition-colors ${isActive ? 'border-blue-400 bg-blue-600 text-white shadow-sm shadow-blue-950/60' : 'border-neutral-700 bg-neutral-800/70 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-800 hover:text-white'}`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className='flex-1 relative'>
        {activeTab === 'live' && (
          <div className="animate-in fade-in duration-500">
            <Suspense fallback={<div className='p-6 text-white text-center'>Loading live view...</div>}>
              <LiveEventTab
                raceId={raceId}
                race={race}
                course={course || null}
                waypoints={waypoints}
                terrainNodes={terrainNodes}
                clock24h={clock24h}
                runnerProfile={userRunnerProfile}
                canEditRunnerIdentity={isAdmin || hasOwnerMembership || isRunner}
                canEditLive={canLogCheckins}
                canEditLiveFeed={canEditRaceSettings}
                onRaceUpdate={() => queryClient.invalidateQueries({ queryKey: ['race', raceId] })}
              />
            </Suspense>
          </div>
        )}

        {activeTab === 'map' && (
          <div className='flex flex-col md:flex-row relative md:absolute md:inset-0 md:h-[calc(100vh-130px)]'>
            {coordinates.length > 0 ? (
              <div className="contents">
                {/* Left Column: Map + Elevation */}
                <div className='flex-1 flex flex-col min-w-0 relative'>
                  <div className='relative overflow-hidden h-[40vh] md:h-auto md:flex-1'>
                    <Suspense fallback={
                      <div className="w-full h-[600px] bg-neutral-900 animate-pulse rounded-xl flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 text-neutral-600 animate-spin" />
                      </div>
                    }>
                      <CourseMap
                        highlightedWaypointId={hoveredWaypointId}
                        coordinates={coordinates}
                        waypoints={courseMapWaypoints}
                        onMapClick={isOwner && isWaypointEditMode ? handleMapClick : undefined}
                        onWaypointClick={(id: string) => {
                          const wp = waypoints.find(w => w.id === id)
                          if (wp) setViewingWaypoint(wp)
                        }}
                        onWaypointMove={isOwner ? handleWaypointMove : undefined}
                        onHover={setHoveredMile}
                        highlightMile={hoveredMile ?? undefined}
                        showMileMarkers={showMileMarkers}
                        showWaypointLabels
                        onToggleMileMarkers={() => setShowMileMarkers(!showMileMarkers)}
                        totalDistance={course?.total_distance_miles || 0}
                        highlightElevation={hoveredMile != null && sampledProfile.length > 0 ? (() => {
                          for (let i = 0; i < sampledProfile.length - 1; i++) {
                            if (sampledProfile[i].distance <= hoveredMile && sampledProfile[i + 1].distance >= hoveredMile) {
                              const t = (hoveredMile - sampledProfile[i].distance) / (sampledProfile[i + 1].distance - sampledProfile[i].distance)
                              return sampledProfile[i].elevation + t * (sampledProfile[i + 1].elevation - sampledProfile[i].elevation)
                            }
                          }
                          return null
                        })() : null}


                        highlightedTerrainId={pendingSegment?.nodeId ?? hoveredTerrainId}
                        activeTerrainRange={pendingSegment ? { startMile: pendingSegment.startMile, endMile: pendingSegment.endMile } : null}
                        terrainNodes={isOwner ? terrainNodes : []}
                        onTerrainNodeClick={isOwner && isTerrainEditMode ? handleEditTerrainSegment : undefined}
                        onSegmentDefined={isOwner && isTerrainEditMode ? (lo, hi) => {
                          setHoveredTerrainId(null)
                          setPendingSegment({ startMile: lo, endMile: hi })
                        } : undefined}
                      />
                    </Suspense>

                    {/* Terrain classification popup — appears once a segment is defined
                        via double-click map endpoints or a profile drag. */}
                    {pendingSegment && (
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white p-4 rounded-lg shadow-xl w-80 border border-neutral-200">
                        <div className="flex items-center justify-between mb-3 border-b pb-2">
                          <h3 className="text-sm font-bold text-neutral-900">Set Terrain</h3>
                          <span className="text-xs font-mono text-neutral-500">
                            {pendingSegment.startMile.toFixed(2)}–{pendingSegment.endMile.toFixed(2)} mi
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          {TERRAIN_TYPES.filter(t => t.value !== 'other').map(t => {
                            const active = pendingType === t.value
                            return (
                              <button
                                key={t.value}
                                onClick={() => setPendingType(t.value as TerrainTypeValue)}
                                className={`text-xs px-2 py-1.5 rounded border text-left transition-colors ${
                                  active
                                    ? 'text-white border-transparent'
                                    : 'text-neutral-700 border-neutral-300 hover:border-neutral-400 bg-white'
                                }`}
                                style={active ? { backgroundColor: getTerrainColor(t.value) } : undefined}
                              >
                                {t.label}
                              </button>
                            )
                          })}
                        </div>

                        <div className="flex gap-2">
                          {pendingSegment.nodeId && (
                            <button
                              onClick={() => handleDeleteTerrainSegment(pendingSegment.nodeId!)}
                              className="py-1.5 px-2 text-xs text-red-700 hover:bg-red-50 rounded border border-red-200 flex items-center justify-center"
                              title="Delete selected terrain segment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={clearPendingTerrainSegment}
                            className="flex-1 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded border border-neutral-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={confirmPendingSegment}
                            className="flex-1 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium rounded shadow-sm"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className='h-32 md:h-40 flex-shrink-0 border-t border-neutral-800 bg-neutral-900 z-10 relative'>
                    <ElevationProfile
                      data={sampledProfile}
                      totalDistance={course?.total_distance_miles || 0}
                      onHover={setHoveredMile}
                      highlightDistance={hoveredMile ?? undefined}
                      highlightedWaypointId={hoveredWaypointId}
                      showMileMarkers={showMileMarkers}
                      waypoints={waypoints.map(wp => ({ id: wp.id, mile: wp.mile, name: wp.name, type: wp.type }))}
                      terrainNodes={isOwner ? terrainNodes : []}
                      onRangeDefined={isOwner && isTerrainEditMode ? (lo, hi) => {
                        setHoveredTerrainId(null)
                        setPendingSegment({ startMile: lo, endMile: hi })
                      } : undefined}
                    />
                  </div>
                </div>

                {/* Right Sidebar: Stats & Waypoints */}
                <div className='w-full md:w-80 border-l border-neutral-800 bg-neutral-900 overflow-y-auto flex-shrink-0'>
                  <div className='p-4 border-b border-neutral-800'>
                    <div className='flex items-center justify-between mb-4'>
                      <h3 className='text-sm font-semibold text-neutral-400 uppercase tracking-wider'>Route Stats</h3>
                    </div>
                    {course && (
                      <div className='space-y-4'>
                        <div className='text-center'>
                          <div className='text-4xl font-bold text-white'>{(course.total_distance_miles ?? 0).toFixed(2)}</div>
                          <div className='text-xs text-neutral-500'>Miles</div>
                        </div>
                        <div className='grid grid-cols-2 gap-4'>
                          <div>
                            <div className='text-2xl font-bold text-green-500'>+{(course.total_elevation_gain_ft || (sampledProfile.length > 0 ? (Math.max(...elevationProfile.map(p => p.elevation)) - Math.min(...elevationProfile.map(p => p.elevation))) : 0)).toLocaleString()}</div>
                            <div className='text-xs text-neutral-500'>Gain (ft)</div>
                          </div>
                          <div>
                            <div className='text-2xl font-bold text-red-400'>-{((course as any).total_elevation_loss_ft || 0).toLocaleString()}</div>
                            <div className='text-xs text-neutral-500'>Loss (ft)</div>
                          </div>
                        </div>
                        <div className='grid grid-cols-2 gap-4'>
                          <div>
                            <div className='text-2xl font-bold text-white'>
                              {(course.max_elevation_ft || (elevationProfile.length > 0 ? Math.max(...elevationProfile.map(p => p.elevation)) : 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className='text-xs text-neutral-500'>Max Elev (ft)</div>
                          </div>
                          <div>
                            <div className='text-2xl font-bold text-white'>
                              {(course.min_elevation_ft || (elevationProfile.length > 0 ? Math.min(...elevationProfile.map(p => p.elevation)) : 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className='text-xs text-neutral-500'>Min Elev (ft)</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isOwner ? (
                      <div className='mt-4 pt-4 border-t border-neutral-800'>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setIsReimporting(!isReimporting)}
                            className='flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors'
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isReimporting ? 'animate-spin' : ''}`} />
                            {isReimporting ? 'Cancel' : 'Update GPX'}
                          </button>
                          <button
                            onClick={handleExportGpx}
                            className='flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors'
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export
                          </button>
                        </div>
                        {isReimporting && (
                          <div className='mt-4'>
                            <GpxUploader
                              onUpload={handleGpxUpload}
                              className="bg-neutral-950/50 border-neutral-800 min-h-[120px]"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className='mt-4 pt-4 border-t border-neutral-800'>
                        <button
                          onClick={handleExportGpx}
                          className='w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors'
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export GPX Route
                        </button>
                      </div>
                    )}
                  </div>


                  <div className='p-4 border-t border-neutral-800'>
                    <div className='flex items-center justify-between mb-4 cursor-pointer' onClick={() => setIsAidListOpen(!isAidListOpen)}>
                      <h3 className='text-sm font-semibold text-neutral-400 flex-1 uppercase tracking-wider flex items-center gap-2'>
                        {isAidListOpen ? '▼' : '▶'} Aid Stations
                      </h3>
                      {isOwner && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const next = !isWaypointEditMode
                              setIsWaypointEditMode(next)
                              if (next) {
                                setIsTerrainEditMode(false)
                                clearPendingTerrainSegment()
                              }
                            }}
                            className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${isWaypointEditMode ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500' : 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'}`}
                          >
                            <Settings className='w-3 h-3' />
                            {isWaypointEditMode ? 'Done' : 'Edit'}
                          </button>
                          {isWaypointEditMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingWaypoint({ mile: 0 }) }}
                              className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isAidListOpen && (
                      <div className="space-y-1">
                        {waypoints.length === 0 ? (
                          <p className="text-xs text-neutral-600 italic">No aid stations added.</p>
                        ) : (
                          waypoints.map(wp => (
                            <div
                              key={wp.id}
                              className="p-2 hover:bg-neutral-800 rounded cursor-pointer transition-colors text-xs text-neutral-400 flex justify-between items-center group"
                              onClick={() => { setViewingWaypoint(wp) }}
                              onMouseEnter={() => { setHoveredMile(wp.mile); setHoveredWaypointId(wp.id) }}
                              onMouseLeave={() => { setHoveredMile(null); setHoveredWaypointId(null) }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{wp.name}</span>
                                {wp.type === 'aid_station' ? (
                                  <span className="flex items-center justify-center w-4 h-4 rounded bg-red-500 text-white font-bold text-xs leading-none select-none" title="Aid Station">+</span>
                                ) : (
                                  <span title={wp.type.replace('_', ' ')}>{getWaypointIcon(wp.type)}</span>
                                )}
                                <div className="flex gap-1">
                                  {wp.crew_allowed && <span title="Crew Access" className="text-[10px] grayscale opacity-80">👥</span>}
                                  {wp.pacer_allowed && <span title="Pacer Pickup" className="text-[10px] grayscale opacity-80">🏃</span>}
                                  {wp.has_drop_bag && <span title="Drop Bag" className="text-[10px] grayscale opacity-80">🎒</span>}
                                </div>
                              </div>
                              <div className="text-neutral-500 text-xs text-right min-w-[3rem]">
                                {wp.mile.toFixed(1)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {isOwner && (
                    <TerrainSidebar
                      terrainNodes={terrainNodes}
                      totalDistance={course?.total_distance_miles ?? 0}
                      canEdit={!!isOwner && isTerrainEditMode}
                      canEnterEdit={!!isOwner}
                      onEditModeChange={editing => {
                        setIsTerrainEditMode(editing)
                        if (editing) setIsWaypointEditMode(false)
                        clearPendingTerrainSegment()
                      }}
                      highlightedTerrainId={pendingSegment?.nodeId ?? hoveredTerrainId}
                      onHoverNode={setHoveredTerrainId}
                      onSaveSegment={handleSaveTerrainSegment}
                      onDeleteSegment={handleDeleteTerrainSegmentRange}
                      onUpdateSegment={handleUpdateTerrainSegment}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className='flex-1 flex flex-col items-center justify-center bg-neutral-950 text-white'>
                <div className='text-4xl mb-4'>🗺️</div>
                <h3 className='text-xl font-bold mb-2'>No course uploaded yet</h3>
                <p className='text-neutral-400 mb-6'>Upload a GPX file to see your route</p>
                <GpxUploader onUpload={handleGpxUpload} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="animate-in fade-in duration-500">
            {course ? (
              <PaceCalculator
                race={race}
                course={course}
                waypoints={waypoints}
                terrainNodes={terrainNodes}
                clock24h={clock24h}
                unitsDistance={profile?.units_distance || 'miles'}
                runnerProfile={userRunnerProfile}
                onUpdateWaypointDelay={handleUpdateWaypointDelay}
              />
            ) : (
              <div className="p-12 text-center text-neutral-500">
                Please upload a course route first.
              </div>
            )}
          </div>
        )}

        {activeTab === 'drop_bags' && (
          <div className="animate-in fade-in duration-500">
            <DropBagsSection
              race={race}
              course={course || null}
              waypoints={waypoints}
              terrainNodes={terrainNodes}
              clock24h={clock24h}
              runnerProfile={userRunnerProfile}
              onGoToPacePlan={() => setActiveTab('plan')}
            />
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="animate-in fade-in duration-500">
            <RaceResources
              race={race}
              canEdit={canEditRaceSettings}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['race', raceId] })}
            />
          </div>
        )}

        {activeTab === 'crew' && (
          <div className="animate-in fade-in duration-500 max-w-5xl mx-auto">
            <Suspense fallback={<div className='p-6 text-white text-center'>Loading crew view…</div>}>
              <CrewView raceId={raceId} embedded />
            </Suspense>
          </div>
        )}

        {activeTab === 'members' && canManageTeam && (
          <div className="animate-in fade-in duration-500">
            <RaceMembersSection raceId={raceId} canInvite={canManageTeam} canManage={canManageTeam} />
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto p-4 md:p-8">
            {/* Hero / Header Info */}
            <div className="bg-neutral-900/50 rounded-2xl p-8 border border-neutral-800 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <img src="/logo.png" className="w-64 h-64 object-contain" alt="Background Logo" />
              </div>
              <div className="relative z-10">
                <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-white mb-4 uppercase">
                  {race?.name}
                  {race?.is_official && <CheckCircle2 className='inline-block w-8 h-8 ml-3 text-blue-400 align-baseline' aria-label='Official event' />}
                </h1>
                {!race?.is_official && race?.official_source_race_id && (
                  <div className='inline-flex items-center gap-1.5 mb-4 px-2 py-1 rounded-full bg-blue-950/50 border border-blue-900/60 text-blue-200 text-xs font-medium'>
                    <CheckCircle2 className='w-3.5 h-3.5' />
                    Based on official event
                  </div>
                )}
                <div className="flex flex-wrap gap-6 text-lg text-neutral-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-orange-500" />
                    <span>
                      {race?.start_datetime ? formatDate(race.start_datetime, 'EEEE, MMMM do, yyyy') : 'Date TBD'}
                      {race?.start_datetime && ` at ${formatClockTime(race.start_datetime, race.timezone, clock24h)}`}
                      {race?.timezone && race?.start_datetime && <span className="ml-2 font-normal text-neutral-500">({formatTimeZoneName(race.start_datetime, race.timezone)})</span>}
                    </span>
                  </div>
                  {race?.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(race.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 hover:text-white transition-colors group"
                    >
                      <MapPin className="w-5 h-5 text-orange-500 group-hover:scale-110 transition-transform" />
                      <span className="border-b border-transparent group-hover:border-neutral-300">{race.location}</span>
                    </a>
                  )}
                </div>

              </div>

              <div className="flex flex-wrap gap-4 mt-8">

                {race?.website_url && (
                  <a href={race.website_url} target="_blank" rel="noopener noreferrer" className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-all flex items-center gap-2 border border-neutral-700">
                    <Globe className="w-4 h-4" /> Website
                  </a>
                )}
                {race?.registration_url && (
                  <a href={race.registration_url} target="_blank" rel="noopener noreferrer" className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-lg shadow-orange-900/20 flex items-center gap-2">
                    Register Now <ArrowUpRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>


            {/* Weather & Conditions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-neutral-900/30 rounded-xl p-6 border border-neutral-800/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <CloudSun className="w-5 h-5 text-yellow-500" /> Race Day Weather & Conditions
                    {fetchingWeather && <RefreshCw className="w-4 h-4 text-neutral-500 animate-spin ml-2" />}
                  </h3>
                </div>
                <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Forecast for race day</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-950/50 p-4 rounded-lg">
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Avg High</div>
                    <div className="text-2xl font-mono text-white">{race?.avg_temp_high || '--'}</div>
                  </div>
                  <div className="bg-neutral-950/50 p-4 rounded-lg">
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Avg Low</div>
                    <div className="text-2xl font-mono text-white">{race?.avg_temp_low || '--'}</div>
                  </div>
                  <div className="bg-neutral-950/50 p-4 rounded-lg">
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Sunrise</div>
                    <div className="text-lg font-mono text-white mb-2">{formatStoredClockTime(race?.sunrise_time, clock24h) || '--'}</div>
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Civil Twilight (Dawn)</div>
                    <div className="text-sm font-mono text-blue-300">{twilight?.dawn || '--'}</div>
                  </div>
                  <div className="bg-neutral-950/50 p-4 rounded-lg">
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Sunset</div>
                    <div className="text-lg font-mono text-white mb-2">{formatStoredClockTime(race?.sunset_time, clock24h) || '--'}</div>
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Civil Twilight (Dusk)</div>
                    <div className="text-sm font-mono text-blue-300">{twilight?.dusk || '--'}</div>
                  </div>
                </div>
                {(race?.weather_notes || race?.moon_phase || race?.precip_chance) && (
                  <div className="mt-4 pt-4 border-t border-neutral-800 grid grid-cols-3 gap-4 text-sm text-neutral-400">
                    {race?.moon_phase && <div><span className="text-neutral-500 block text-xs uppercase">Moon</span> {race.moon_phase}</div>}
                    {race?.precip_chance && <div><span className="text-neutral-500 block text-xs uppercase">Precip</span> {race.precip_chance}</div>}
                    {race?.weather_notes && <div><span className="text-neutral-500 block text-xs uppercase">Conditions</span> {race.weather_notes}</div>}
                  </div>
                )}

                {/* Today's Conditions at the race location */}
                {currentWeather && (
                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Today at Race Location</div>
                    <div className="flex items-center justify-between bg-neutral-950/50 px-3 py-2 rounded text-sm">
                      <span className="text-neutral-400 font-mono">{new Date(currentWeather.asOfDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-red-400 font-mono">{currentWeather.high}°</span>
                        <span className="text-blue-400 font-mono">{currentWeather.low}°</span>
                        <span className="text-neutral-400 text-xs w-24 truncate text-right">{currentWeather.conditions}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Historical Weather Data */}
                {(race as any)?.weather_history && (() => {
                  const history = (race as any).weather_history as { normals?: { avg_high: number; avg_low: number; avg_precip: number } | null; past_years?: { year: number; date?: string; high: number; low: number; precip: number; conditions: string }[] }
                  return (
                    <div className="mt-4 pt-4 border-t border-neutral-800">
                      {history.normals && (
                        <div className="mb-3">
                          <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">30-Year Climate Normals</div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-neutral-950/50 px-3 py-2 rounded text-center">
                              <div className="text-neutral-500 text-xs">Avg High</div>
                              <div className="text-white font-mono text-sm">{history.normals.avg_high}°F</div>
                            </div>
                            <div className="bg-neutral-950/50 px-3 py-2 rounded text-center">
                              <div className="text-neutral-500 text-xs">Avg Low</div>
                              <div className="text-white font-mono text-sm">{history.normals.avg_low}°F</div>
                            </div>
                            <div className="bg-neutral-950/50 px-3 py-2 rounded text-center">
                              <div className="text-neutral-500 text-xs">Avg Precip</div>
                              <div className="text-white font-mono text-sm">{history.normals.avg_precip}"</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {history.past_years && history.past_years.length > 0 && (
                        <div>
                          <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Past Years on This Date</div>
                          <div className="space-y-1.5">
                            {history.past_years.map((yr) => {
                              const dateLabel = yr.date ? new Date(yr.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
                              return (
                                <div key={yr.year} className="flex items-center justify-between bg-neutral-950/50 px-3 py-2 rounded text-sm">
                                  <span className="text-neutral-400 font-mono">{dateLabel ? `${dateLabel}, ${yr.year}` : yr.year}</span>
                                  <div className="flex items-center gap-4">
                                    <span className="text-red-400 font-mono">{yr.high}°</span>
                                    <span className="text-blue-400 font-mono">{yr.low}°</span>
                                    <span className="text-neutral-400 text-xs w-24 truncate text-right">{yr.conditions}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {race && <WeatherLocations race={race} course={course ?? null} canEdit={canEdit} />}
              </div>

              <div className="bg-neutral-900/30 rounded-xl p-6 border border-neutral-800/50">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" /> Race Stats
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                    <span className="text-neutral-400">Distance</span>
                    <span className="text-white font-mono">{(course?.total_distance_miles ?? race?.distance_miles ?? 0).toFixed(1)} mi</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                    <span className="text-neutral-400">Elevation Gain</span>
                    <span className="text-white font-mono">{(course?.total_elevation_gain_ft || 0).toLocaleString()} ft</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                    <span className="text-neutral-400">Elevation Loss</span>
                    <span className="text-white font-mono">{((course as any)?.total_elevation_loss_ft || 0).toLocaleString()} ft</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                    <span className="text-neutral-400">Overall Cutoff</span>
                    <span className="text-white font-mono">{race?.overall_cutoff || '--'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                    <span className="text-neutral-400">Course Type</span>
                    <span className="text-white">{race?.course_type || '--'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-neutral-800">
                    <span className="text-neutral-400">Terrain</span>
                    <span className="text-white capitalize">{race?.terrain_type || 'trail'}</span>
                  </div>
                  {race?.qualifies_for && (
                    <div className="py-2">
                      <span className="text-neutral-400 block mb-1">Qualifies For</span>
                      <div className="flex flex-wrap gap-2">
                        {race.qualifies_for.split(',').map((q, i) => (
                          <span key={i} className="bg-neutral-800 text-xs px-2 py-1 rounded border border-neutral-700 text-neutral-300">
                            {q.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Records */}
            {(race?.course_record_male || race?.course_record_female) && (
              <div className="bg-neutral-900/30 rounded-xl p-6 border border-neutral-800/50">
                <h3 className="text-xl font-bold text-white mb-4">Course Records</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {race?.course_record_male && (
                    <div className="flex items-center justify-between bg-neutral-950/50 p-4 rounded-lg border-l-2 border-blue-500">
                      <span className="text-neutral-400">Men's Record</span>
                      <span className="text-white font-mono font-bold">{race.course_record_male}</span>
                    </div>
                  )}
                  {race?.course_record_female && (
                    <div className="flex items-center justify-between bg-neutral-950/50 p-4 rounded-lg border-l-2 border-pink-500">
                      <span className="text-neutral-400">Women's Record</span>
                      <span className="text-white font-mono font-bold">{race.course_record_female}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="p-2 text-center text-[10px] text-neutral-600 border-t border-neutral-800">
              v.{__COMMIT_HASH__}
            </div>
          </div>
        )
        }

      </main >

    </div >
  )
}
