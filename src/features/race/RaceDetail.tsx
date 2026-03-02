import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, MapPin, Globe, ArrowUpRight, CloudSun, Trophy, RefreshCw, Settings } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Race, Course, Waypoint, TerrainNode } from '@/types/database'
import { fetchWeatherForRace } from '@/lib/weather-service'
import { sampleElevationProfile, type GpxParseResult } from '@/lib/gpx-parser'
import { getNearestPointOnLine, getDistanceFromStart } from '@/lib/geo-utils'
import { formatDate } from '@/lib/utils'

import { CourseMap } from '@/features/course/CourseMap'
import { ElevationProfile } from '@/features/course/ElevationProfile'
import { GpxUploader } from '@/features/course/GpxUploader'
import { EditRaceModal } from '@/features/race/EditRaceModal'
import { EditWaypointModal } from '@/features/course/EditWaypointModal'
import { EditTerrainModal } from '@/features/course/EditTerrainModal'
import { PaceCalculator } from '@/features/race/PaceCalculator'
import { RaceResources } from '@/features/race/RaceResources'

type Tab = 'overview' | 'map' | 'plan' | 'resources'

// Helper to get icon
function getWaypointIcon(type: string): string {
  switch (type) {
    case 'start': return '🏁'
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

export function RaceDetail({ raceId }: { raceId: string }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingWaypoint, setEditingWaypoint] = useState<Partial<Waypoint> | null>(null)

  // Terrain State
  const [terrainNodes, setTerrainNodes] = useState<TerrainNode[]>([])
  const [editingTerrainNode, setEditingTerrainNode] = useState<Partial<TerrainNode> | null>(null)

  const [hoveredMile, setHoveredMile] = useState<number | null>(null)
  const [hoveredWaypointId, setHoveredWaypointId] = useState<string | null>(null)
  const [hoveredTerrainId, setHoveredTerrainId] = useState<string | null>(null)

  const [showMileMarkers, setShowMileMarkers] = useState(true)
  const [fetchingWeather, setFetchingWeather] = useState(false)
  const [isAidListOpen, setIsAidListOpen] = useState(true)
  const [isTerrainListOpen, setIsTerrainListOpen] = useState(true)
  const [isReimporting, setIsReimporting] = useState(false)

  // Data Fetching
  const { data: race, isLoading: raceLoading } = useQuery({
    queryKey: ['race', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('races').select('*').eq('id', raceId).single()
      if (error) throw error
      return data as Race
    }
  })

  // Auto-fetch weather if missing
  useEffect(() => {
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
  }, [race?.location, race?.start_datetime, race?.avg_temp_high, raceId, fetchingWeather, queryClient])

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

  const { data: course } = useQuery({
    queryKey: ['course', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('*').eq('race_id', raceId).single()
      if (error && error.code !== 'PGRST116') throw error
      return data as Course | null
    }
  })

  const { data: waypoints = [] } = useQuery({
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



  // Fetch Terrain Nodes
  useEffect(() => {
    if (!course?.id) return
    const fetchTerrain = async () => {
      const { data } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      if (data) setTerrainNodes(data)
    }
    fetchTerrain()
  }, [course?.id])

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
          const maxOrder = Math.max(...waypoints.map(w => w.order_index), 0)
          const waypointsToInsert = result.waypoints.map((wpt, i) => {
            // Snap waypoint to the route and compute mile
            const nearest = getNearestPointOnLine({ lat: wpt.lat, lon: wpt.lon }, result.coordinates)
            let mile = 0
            let lat = wpt.lat
            let lon = wpt.lon
            if (nearest && nearest.distance < 2) { // within 2 miles of route
              mile = getDistanceFromStart(result.coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })
              lat = nearest.lat
              lon = nearest.lon
            }
            return {
              course_id: courseId,
              name: wpt.name,
              type: 'aid_station',
              lat,
              lon,
              mile: Math.round(mile * 100) / 100,
              order_index: maxOrder + i + 1,
              has_drop_bag: false,
              crew_allowed: false,
              pacer_allowed: false,
            }
          })

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
          const { getCoordinateAtDistance, getNearestPointOnLine } = await import('@/lib/geo-utils')
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
          notes: data.notes
        }).eq('id', data.id)
        if (error) throw error
      } else {
        const maxOrder = Math.max(...waypoints.map(w => w.order_index), 0)

        // If we have a mile, calculate lat/lon from the course geometry
        let lat = data.lat
        let lon = data.lon

        if (data.mile !== undefined && course?.geometry) {
          const { getCoordinateAtDistance, getNearestPointOnLine } = await import('@/lib/geo-utils')
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
          notes: data.notes
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

  const [isTerrainMode, setIsTerrainMode] = useState(false)

  // Map Interactions
  const handleMapClick = (lat: number, lon: number, type?: string) => {
    if (!course?.geometry) return
    const coordinates = (course.geometry as { coordinates: [number, number][] }).coordinates
    if (!coordinates || coordinates.length === 0) return

    const nearest = getNearestPointOnLine({ lat, lon }, coordinates)

    // If we are in Terrain Mode, clicking anywhere adds a terrain segment there
    if (isTerrainMode) {
      if (nearest) {
        const mile = getDistanceFromStart(coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })
        setEditingTerrainNode({ mile })
      }
      return
    }

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
      const { error } = await (supabase.from('waypoints') as any).update({
        lat,
        lon,
        mile
      }).eq('id', id)

      if (error) throw error

      // Revalidate to ensure server state matches
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch {
      // Rollback on error
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
      alert('Failed to move waypoint')
    }
  }


  const handleDeleteTerrainNode = async (id: string) => {
    if (!confirm('Delete this terrain change?')) return

    // Optimistic update to remove it immediately for responsiveness
    setTerrainNodes(prev => prev.filter(n => n.id !== id))
    setEditingTerrainNode(null)

    const { error } = await supabase.from('terrain_nodes').delete().eq('id', id)
    if (error) {
      alert('Failed to delete')
      // Revert if failed
      if (course?.id) {
        const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
        if (tNodes) setTerrainNodes(tNodes)
      }
    } else {
      // Success. The optimistic update already handled it, but let's ensure consistency.
      if (course?.id) {
        const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
        if (tNodes) setTerrainNodes(tNodes)
      }
    }
  }

  const handleTerrainNodeMove = async (id: string, lat: number, lon: number, mile: number) => {
    // Optimistic Update
    setTerrainNodes(prev => prev.map(n => n.id === id ? { ...n, lat, lon, mile } : n).sort((a, b) => a.mile - b.mile))

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('terrain_nodes') as any).update({
        lat, lon, mile
      }).eq('id', id)

      if (error) throw error
    } catch (err) {
      console.error('Failed to move terrain node:', err)
      // Revert/Refresh on error
      if (course?.id) {
        const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
        if (tNodes) setTerrainNodes(tNodes)
      }
    }
  }


  // Handle saving a range/segment of terrain
  const handleSaveTerrainSegment = async (startMile: number, endMile: number, type: string, difficulty: number) => {
    try {
      if (!course?.id) return

      const helperInsert = async (mile: number, t: string, d: number) => {
        let lat = 0, lon = 0
        if (course.geometry) {
          const { getCoordinateAtDistance } = await import('@/lib/geo-utils')
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

      console.log('--- Saving Segment ---')
      console.log('Inputs:', { startMile, endMile, type, difficulty })

      const prevAtEnd = getTerrainAt(endMile)
      console.log('Terrain at End (Restore Target):', prevAtEnd)

      const typeAtEnd = prevAtEnd.type
      const diffAtEnd = prevAtEnd.difficulty


      // A. Insert/Update Start Node
      const existingStart = terrainNodes.find(n => Math.abs(n.mile - startMile) < 0.01)
      if (existingStart) {
        console.log('Updating existing start node:', existingStart.id)
        const { error } = await (supabase.from('terrain_nodes') as any).update({ type, difficulty }).eq('id', existingStart.id)
        if (error) throw error
      } else {
        console.log('Inserting new start node at', startMile)
        await helperInsert(startMile, type, difficulty)
      }

      // B. Insert/Update End Node (Restore previous state)
      if (endMile < (course.total_distance_miles || 100)) {
        const existingEnd = terrainNodes.find(n => Math.abs(n.mile - endMile) < 0.01)
        if (existingEnd) {
          console.log('Existing end node found, skipping restore:', existingEnd)
        } else {
          console.log('Inserting restore node at', endMile, 'Type:', typeAtEnd)
          await helperInsert(endMile, typeAtEnd, diffAtEnd)
        }
      } else {
        console.log('End mile is at course end, skipping restore node.')
      }

      // C. Delete Intermediate Nodes

      // C. Delete Intermediate Nodes (they are overridden by this new segment)
      // Nodes strictly between start and end
      const nodesToDelete = terrainNodes.filter(n => n.mile > (startMile + 0.01) && n.mile < (endMile - 0.01))
      if (nodesToDelete.length > 0) {
        await supabase.from('terrain_nodes').delete().in('id', nodesToDelete.map(n => n.id))
      }

      // Refresh
      const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      if (tNodes) setTerrainNodes(tNodes)

    } catch (err: any) {
      console.error('Error saving terrain segment:', err)
      alert(`Failed to save segment: ${err.message || JSON.stringify(err)}`)
    }
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
      has_drop_bag: wp.has_drop_bag,
      crew_allowed: wp.crew_allowed,
      pacer_allowed: wp.pacer_allowed
    })),
    [waypoints]
  )
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'map', label: 'Course Map' },
    { id: 'plan', label: 'Pace Plan' },
    { id: 'resources', label: 'Resources' },
  ]

  if (raceLoading) return <div className='p-8 text-white'>Loading race...</div>
  if (!race) return <div className='p-8 text-white'>Race not found</div>

  return (
    <div className='min-h-screen bg-neutral-950 flex flex-col'>
      {/* Header */}
      <header className='border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-[100]'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex justify-between items-center'>
          <div className='flex items-center gap-2 sm:gap-8'>
            <Link to='/dashboard' className='flex items-center hover:opacity-80 transition-opacity cursor-pointer pointer-events-auto relative z-[999] -space-x-5'>
              <img src="/logo.png" alt="DFIU Logo" className="h-20 sm:h-24 w-auto object-contain drop-shadow-md relative z-10" />
              <div className="hidden sm:flex flex-col justify-center items-start">
                <span className="font-black italic tracking-tighter text-6xl uppercase bg-gradient-to-br from-orange-400 to-orange-600 bg-clip-text text-transparent pr-1 relative z-0 leading-[0.8]">DFIU</span>
                <span className="text-neutral-400 text-[10px] font-bold tracking-[0.15em] uppercase opacity-70 -ml-0.5">Don't F* It Up!</span>
              </div>
            </Link>

            <div className="flex sm:hidden flex-col gap-1">
              <div className='flex items-center gap-2'>
                <h1 className='text-lg font-bold text-white'>{race.name}</h1>
                <button onClick={() => setShowEditModal(true)} className='text-neutral-400 hover:text-white text-sm'>
                  ✎
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {race.start_datetime && (
                  <div className='text-neutral-400 font-medium flex items-center gap-1'>
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
                <button onClick={() => setShowEditModal(true)} className='text-neutral-400 hover:text-white'>
                  ✎
                </button>
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
          <div className='flex items-center gap-4'>
            <Link to="/settings" className="flex items-center gap-3 hover:bg-neutral-900 rounded-lg p-2 transition-colors group">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-white group-hover:text-orange-500 transition-colors">
                  {profile?.name || 'User'}
                </div>
              </div>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-9 h-9 rounded-full border border-neutral-700 object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-400 group-hover:border-orange-500/50 transition-colors">
                  {(profile?.name?.[0] || '?').toUpperCase()}
                </div>
              )}
              <Settings className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" />
            </Link>
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
          onDelete={async () => {
            try {
              // Delete everything related to this race
              // Supabase should handle cascade if configured, but let's be safe usually
              // Assuming cascade is ON for race_id foreign keys, which is standard.
              // If not, we'd need to delete courses, waypoints, etc. first.
              // Let's assume simplest path: delete race.
              const { error } = await supabase.from('races').delete().eq('id', race.id)
              if (error) throw error

              // Redirect to dashboard
              window.location.href = '/dashboard'
            } catch (err) {
              console.error('Failed to delete race:', err)
              alert('Failed to delete race. Please try again.')
            }
          }}
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

      {/* Tabs */}
      <nav className='border-b border-neutral-800 bg-neutral-900'>
        <div className='max-w-7xl mx-auto px-4 flex gap-6'>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id ? 'border-blue-500 text-blue-500' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className='flex-1 relative'>
        {activeTab === 'map' && (
          <div className='flex flex-col md:flex-row relative md:absolute md:inset-0 md:h-[calc(100vh-130px)]'>
            {coordinates.length > 0 ? (
              <div className="contents">
                {/* Left Column: Map + Elevation */}
                <div className='flex-1 flex flex-col min-w-0 relative'>
                  <div className='relative overflow-hidden h-[50vh] md:h-auto md:flex-1'>
                    <CourseMap
                      highlightedWaypointId={hoveredWaypointId}
                      coordinates={coordinates}
                      waypoints={courseMapWaypoints}
                      isTerrainMode={isTerrainMode}
                      onMapClick={handleMapClick}
                      onWaypointClick={(id) => {
                        const wp = waypoints.find(w => w.id === id)
                        if (wp) setEditingWaypoint(wp)
                      }}
                      onWaypointMove={handleWaypointMove}
                      onHover={setHoveredMile}
                      highlightMile={hoveredMile ?? undefined}
                      showMileMarkers={showMileMarkers}
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


                      highlightedTerrainId={hoveredTerrainId} // New Prop
                      terrainNodes={terrainNodes}
                      onTerrainNodeClick={(id) => {
                        const node = terrainNodes.find(n => n.id === id)
                        if (node) setEditingTerrainNode(node)
                      }}
                      onSaveTerrain={handleSaveTerrainSegment}
                      onTerrainNodeMove={handleTerrainNodeMove}
                    />
                  </div>
                  <div className='h-40 flex-shrink-0 border-t border-neutral-800 bg-neutral-900 z-10 relative'>
                    <ElevationProfile
                      data={sampledProfile}
                      totalDistance={course?.total_distance_miles || 0}
                      onHover={setHoveredMile}
                      highlightDistance={hoveredMile ?? undefined}
                      showMileMarkers={showMileMarkers}
                      waypoints={waypoints.map(wp => ({ mile: wp.mile, name: wp.name, type: wp.type }))}
                      terrainNodes={terrainNodes}
                    />
                  </div>
                </div>

                {/* Right Sidebar: Stats & Waypoints */}
                <div className='w-full md:w-80 border-l border-neutral-800 bg-neutral-900 overflow-y-auto flex-shrink-0'>
                  <div className='p-4 border-b border-neutral-800'>
                    <h3 className='text-sm font-semibold text-neutral-400 mb-4 uppercase tracking-wider'>Route Stats</h3>
                    {course && (
                      <div className='grid grid-cols-2 gap-4'>
                        <div>
                          <div className='text-2xl font-bold text-white'>{(course.total_distance_miles ?? 0).toFixed(2)}</div>
                          <div className='text-xs text-neutral-500'>Miles</div>
                        </div>
                        <div>
                          <div className='text-2xl font-bold text-green-500'>+{(course.total_elevation_gain_ft || (sampledProfile.length > 0 ? (Math.max(...elevationProfile.map(p => p.elevation)) - Math.min(...elevationProfile.map(p => p.elevation))) : 0)).toLocaleString()}</div>
                          <div className='text-xs text-neutral-500'>Gain (ft)</div>
                        </div>
                        <div>
                          <div className='text-2xl font-bold text-red-400'>-{((course as any).total_elevation_loss_ft || 0).toLocaleString()}</div>
                          <div className='text-xs text-neutral-500'>Loss (ft)</div>
                        </div>
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
                    )}

                    <div className='mt-4 pt-4 border-t border-neutral-800'>
                      <button
                        onClick={() => setIsReimporting(!isReimporting)}
                        className='w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors'
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isReimporting ? 'animate-spin' : ''}`} />
                        {isReimporting ? 'Cancel Update' : 'Update GPX Route'}
                      </button>
                      {isReimporting && (
                        <div className='mt-4'>
                          <GpxUploader
                            onUpload={handleGpxUpload}
                            className="bg-neutral-950/50 border-neutral-800 min-h-[120px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>


                  <div className='p-4 border-t border-neutral-800'>
                    <div className='flex items-center justify-between mb-4 cursor-pointer' onClick={() => setIsAidListOpen(!isAidListOpen)}>
                      <h3 className='text-sm font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2'>
                        {isAidListOpen ? '▼' : '▶'} Aid Stations
                      </h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingWaypoint({ mile: 0 }) }}
                        className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors"
                      >
                        + Add
                      </button>
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
                              onClick={() => setEditingWaypoint(wp)}
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

                  <div className='p-4 border-t border-neutral-800'>
                    <div className='flex items-center justify-between mb-4'>
                      <div className='flex items-center gap-2 cursor-pointer' onClick={() => setIsTerrainListOpen(!isTerrainListOpen)}>
                        <h3 className='text-sm font-semibold text-neutral-400 uppercase tracking-wider'>
                          {isTerrainListOpen ? '▼' : '▶'} Terrain
                        </h3>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsTerrainMode(!isTerrainMode)}
                          className={`text-xs px-2 py-1 rounded border transition-colors flex items-center gap-1 ${isTerrainMode ? 'bg-blue-600 text-white border-blue-500' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700'}`}
                          title="Click map to add segments"
                        >
                          {isTerrainMode ? '✏️ Drawing' : '✏️ Draw'}
                        </button>
                        {/* Manual Add Button fallback */}
                        <button
                          onClick={() => setEditingTerrainNode({})}
                          className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors"
                        >
                          + Manual
                        </button>
                      </div>
                    </div>

                    {isTerrainListOpen && (
                      <div className="space-y-1">
                        {terrainNodes.length === 0 ? (
                          <p className="text-xs text-neutral-600 italic">No terrain segments defined. Entire course defaults to 'Undefined' (Gray).</p>
                        ) : (
                          <>
                            {/* Synthetic Start Gap */}
                            {terrainNodes[0].mile > 0.05 && (
                              <div
                                className="p-2 hover:bg-neutral-800 rounded cursor-pointer transition-colors text-xs text-neutral-400 flex justify-between items-center group"
                                onClick={() => setEditingTerrainNode({ mile: 0, type: 'other', difficulty: 100 })}
                              >
                                <div>
                                  <span className="text-neutral-500">0.00 - {terrainNodes[0].mile.toFixed(2)}: </span>
                                  <span className="text-neutral-500 font-medium italic">Undefined</span>
                                </div>
                                <span className="bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-700 border border-neutral-800 group-hover:text-white">
                                  Edit
                                </span>
                              </div>
                            )}

                            {/* Actual Segments */}
                            {terrainNodes.map((node, i) => {
                              const nextNode = terrainNodes[i + 1]
                              const startMile = node.mile
                              const endMile = nextNode ? nextNode.mile : (course?.total_distance_miles || 100)
                              const isUndefined = node.type === 'other'

                              return (
                                <div
                                  key={node.id}
                                  className="p-2 hover:bg-neutral-800 rounded cursor-pointer transition-colors text-xs text-neutral-400 flex justify-between items-center group"
                                  onClick={() => setEditingTerrainNode(node)}
                                  onMouseEnter={() => setHoveredTerrainId(node.id)}
                                  onMouseLeave={() => setHoveredTerrainId(null)}
                                >
                                  <div>
                                    <span className="text-neutral-500">{startMile.toFixed(2)} - {endMile.toFixed(2)}: </span>
                                    <span className={`font-medium capitalize ${isUndefined ? 'text-neutral-500 italic' : 'text-white'}`}>
                                      {isUndefined ? 'Undefined' : node.type.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <span className="bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-500 group-hover:text-white border border-neutral-800">
                                    {node.difficulty}%
                                  </span>
                                </div>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
              />
            ) : (
              <div className="p-12 text-center text-neutral-500">
                Please upload a course route first.
              </div>
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="animate-in fade-in duration-500">
            <RaceResources
              race={race}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['race', raceId] })}
            />
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
                </h1>
                <div className="flex flex-wrap gap-6 text-lg text-neutral-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-orange-500" />
                    <span>
                      {race?.start_datetime ? formatDate(race.start_datetime, 'EEEE, MMMM do, yyyy') : 'Date TBD'}
                      {race?.start_datetime && ` at ${formatDate(race.start_datetime, 'h:mm a')}`}
                      {race?.timezone && <span className="ml-2 text-neutral-500 font-normal">({race.timezone.replace('_', ' ')})</span>}
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
                    <CloudSun className="w-5 h-5 text-yellow-500" /> Weather & Conditions
                    {fetchingWeather && <RefreshCw className="w-4 h-4 text-neutral-500 animate-spin ml-2" />}
                  </h3>
                </div>
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
                    <div className="text-lg font-mono text-white">{race?.sunrise_time || '--'}</div>
                  </div>
                  <div className="bg-neutral-950/50 p-4 rounded-lg">
                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Sunset</div>
                    <div className="text-lg font-mono text-white">{race?.sunset_time || '--'}</div>
                  </div>
                </div>
                {(race?.weather_notes || race?.moon_phase || race?.precip_chance) && (
                  <div className="mt-4 pt-4 border-t border-neutral-800 grid grid-cols-3 gap-4 text-sm text-neutral-400">
                    {race?.moon_phase && <div><span className="text-neutral-500 block text-xs uppercase">Moon</span> {race.moon_phase}</div>}
                    {race?.precip_chance && <div><span className="text-neutral-500 block text-xs uppercase">Precip</span> {race.precip_chance}</div>}
                    {race?.weather_notes && <div><span className="text-neutral-500 block text-xs uppercase">Conditions</span> {race.weather_notes}</div>}
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

      {editingTerrainNode && (
        <EditTerrainModal
          node={editingTerrainNode}
          startMile={editingTerrainNode.mile ?? 0}
          endMile={(() => {
            // 1. If modifying an existing node, find the next one
            if (editingTerrainNode.id) {
              const idx = terrainNodes.findIndex(n => n.id === editingTerrainNode.id)
              if (idx >= 0 && idx < terrainNodes.length - 1) {
                return terrainNodes[idx + 1].mile
              }
            } else {
              // 2. If creating a NEW node (e.g. filling a gap), search for the *next* existing node
              const start = editingTerrainNode.mile ?? 0
              // Find the first node AFTER this start point
              const nextNode = terrainNodes.find(n => n.mile > start + 0.001)
              if (nextNode) {
                return nextNode.mile // Default to filling the gap
              }
            }

            // 3. Default for New Node or Last Node: Start + 0.5 (capped)
            const start = editingTerrainNode.mile ?? 0
            const total = course?.total_distance_miles || 100
            return Math.min(start + 0.5, total)
          })()}
          onClose={() => setEditingTerrainNode(null)}
          onSave={async (start, end, type, diff) => {
            // Delete-then-Paint Strategy:
            // 1. Delete the "Old Start" node (editingTerrainNode) ONLY if we moved the start mile.
            //    If we didn't move it, handleSaveTerrainSegment handles the update correctly.
            //    If we delete it, handleSaveTerrainSegment (with stale state) might try to update a deleted node ID.

            // Only consider deleting if we are editing an EXISTING node
            if (editingTerrainNode.id) {
              const currentStartMile = editingTerrainNode.mile ?? 0
              const isMove = Math.abs(start - currentStartMile) > 0.001

              if (isMove) {
                await handleDeleteTerrainNode(editingTerrainNode.id)
              }
            }

            await handleSaveTerrainSegment(start, end, type, diff)
            setEditingTerrainNode(null)
          }}
          onDelete={async (id) => {
            await handleDeleteTerrainNode(id)
            setEditingTerrainNode(null)
          }}
        />
      )}
    </div >
  )
}
