import { useState, useEffect } from 'react'
import { fetchWeatherForRace } from '@/lib/weather-service'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Race, Course, Waypoint, TerrainNode } from '@/types/database'
import { Calendar, MapPin, Globe, ArrowUpRight, CloudSun, Trophy, RefreshCw } from 'lucide-react'
import { CourseMap } from '@/features/course/CourseMap'
import { ElevationProfile } from '@/features/course/ElevationProfile'
import { GpxUploader } from '@/features/course/GpxUploader'
import { EditRaceModal } from '@/features/race/EditRaceModal'
import { EditWaypointModal } from '@/features/course/EditWaypointModal'
import { EditTerrainModal } from '@/features/course/EditTerrainModal'
import { sampleElevationProfile, type GpxParseResult } from '@/lib/gpx-parser'
import { getNearestPointOnLine, getDistanceFromStart } from '@/lib/geo-utils'
import { formatDate } from '@/lib/utils'

type Tab = 'overview' | 'map' | 'plan' | 'docs'

export function RaceDetail({ raceId }: { raceId: string }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingWaypoint, setEditingWaypoint] = useState<Partial<Waypoint> | null>(null)

  // Terrain State
  const [terrainNodes, setTerrainNodes] = useState<TerrainNode[]>([])
  const [editingTerrainNode, setEditingTerrainNode] = useState<Partial<TerrainNode> | null>(null)

  const [hoveredMile, setHoveredMile] = useState<number | null>(null)
  const [showMileMarkers, setShowMileMarkers] = useState(false)
  const [fetchingWeather, setFetchingWeather] = useState(false)
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
        .order('order_index', { ascending: true })
      if (error) throw error
      return data as Waypoint[]
    }
  })

  const handleGpxUpload = async (result: GpxParseResult, rawGpx: string) => {
    try {

      // Check for missing elevation data
      if (result.elevationProfile.length === 0) {
        alert('Warning: The uploaded GPX file does not contain elevation data. The elevation profile will be empty.')
      }

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
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('courses') as any).insert({
          race_id: raceId,
          raw_gpx: rawGpx,
          geometry: { type: 'LineString', coordinates: result.coordinates },
          elevation_samples: result.elevationProfile,
          total_distance_miles: result.stats.totalDistanceMiles,
          total_elevation_gain_ft: result.stats.totalElevationGainFt,
          total_elevation_loss_ft: result.stats.totalElevationLossFt,
          min_elevation_ft: result.stats.minElevationFt,
          max_elevation_ft: result.stats.maxElevationFt,
        })
        if (error) throw error
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('races') as any).update({ distance_miles: result.stats.totalDistanceMiles }).eq('id', raceId)

      queryClient.invalidateQueries({ queryKey: ['course', raceId] })
      queryClient.invalidateQueries({ queryKey: ['race', raceId] })
      setIsReimporting(false)
    } catch (err) {
      console.error('Failed to save course:', err)
      alert('Failed to save course')
    }
  }

  const handleSaveWaypoint = async (data: Partial<Waypoint>) => {
    try {
      if (data.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('waypoints') as any).update({
          name: data.name,
          type: data.type,
          cutoff_time: data.cutoff_time || null,
          has_drop_bag: data.has_drop_bag,
          crew_allowed: data.crew_allowed,
          pacer_allowed: data.pacer_allowed,
          notes: data.notes
        }).eq('id', data.id)
        if (error) throw error
      } else {
        const maxOrder = Math.max(...waypoints.map(w => w.order_index), 0)

        // If lat/lon are missing but we have mile, calculate them
        let lat = data.lat
        let lon = data.lon

        if ((!lat || !lon) && data.mile !== undefined && course?.geometry) {
          const { getCoordinateAtDistance } = await import('@/lib/geo-utils')
          // Construct GeoJSON from course geometry for the util
          const geoJson = {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: course.geometry
            }]
          } as any

          const coord = getCoordinateAtDistance(geoJson, data.mile * 1609.34)
          if (coord) {
            lon = coord[0]
            lat = coord[1]
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

  // Map Interactions
  const handleMapClick = (lat: number, lon: number, type?: string) => {
    if (!course?.geometry) return
    const coordinates = (course.geometry as { coordinates: [number, number][] }).coordinates
    if (!coordinates || coordinates.length === 0) return

    const nearest = getNearestPointOnLine({ lat, lon }, coordinates)

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
    // Optimistic update? Or just wait for DB? 
    // For drag, optimistic is better but let's stick to simple first.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('waypoints') as any).update({
        lat,
        lon,
        mile
      }).eq('id', id)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch (err) {
      alert('Failed to move waypoint')
    }
  }



  // Terrain Handlers
  const handleSaveTerrainNode = async (data: Partial<TerrainNode>) => {
    try {
      if (!course?.id) return

      // Improve location calculation if lat/lon missing but mile exists
      let lat = data.lat
      let lon = data.lon

      if ((!lat || !lon) && data.mile !== undefined && course?.geometry) {
        const { getCoordinateAtDistance } = await import('@/lib/geo-utils')

        // Pass geometry directly - geo-utils now handles Geometry objects
        const geometry = course.geometry as any

        const coord = getCoordinateAtDistance(geometry, data.mile * 1609.34)

        if (coord) {
          lon = coord[0]
          lat = coord[1]
        } else {
          const courseLength = course.total_distance_miles || 0

          if (data.mile > courseLength) {
            throw new Error(`Mile ${data.mile} is beyond the course length of ${courseLength.toFixed(1)} miles.`)
          }
          throw new Error(`Could not calculate location for mile ${data.mile}. Ensure it is within the course distance.`)
        }
      }

      if (data.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('terrain_nodes') as any).update({
          type: data.type,
          difficulty: data.difficulty,
          mile: data.mile,
          lat,
          lon
        }).eq('id', data.id)
        if (error) throw error
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('terrain_nodes') as any).insert({
          course_id: course.id,
          type: data.type,
          difficulty: data.difficulty,
          mile: data.mile,
          lat,
          lon
        })
        if (error) throw error
      }

      setEditingTerrainNode(null)
      // Refresh
      const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
      if (tNodes) setTerrainNodes(tNodes)

    } catch (err: any) {
      console.error('Error saving terrain node:', err)
      alert(`Failed to save terrain: ${err.message}`)
    }
  }

  const handleDeleteTerrainNode = async (id: string) => {
    if (!confirm('Delete this terrain change?')) return
    const { error } = await supabase.from('terrain_nodes').delete().eq('id', id)
    if (error) {
      alert('Failed to delete')
    } else {
      setEditingTerrainNode(null)
      // Refresh
      if (course?.id) {
        const { data: tNodes } = await supabase.from('terrain_nodes').select('*').eq('course_id', course.id).order('mile')
        if (tNodes) setTerrainNodes(tNodes)
      }
    }
  }


  // Derived State
  const coordinates = (course?.geometry as { coordinates?: [number, number][] })?.coordinates || []
  const elevationProfile = (course?.elevation_samples as { distance: number; elevation: number }[]) || []
  const sampledProfile = sampleElevationProfile(elevationProfile, 200)
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'map', label: 'Course Map' },
    { id: 'plan', label: 'Pace Plan' },
    { id: 'docs', label: 'Documents' },
  ]

  if (raceLoading) return <div className='p-8 text-white'>Loading race...</div>
  if (!race) return <div className='p-8 text-white'>Race not found</div>

  return (
    <div className='min-h-screen bg-neutral-950 flex flex-col'>
      {/* Header */}
      <header className='border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-[100]'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <Link to='/dashboard' className='flex items-center hover:opacity-80 transition-opacity cursor-pointer pointer-events-auto relative z-[999]'>
              <img src="/logo.png" alt="DFIU Logo" className="h-16 w-16 object-contain drop-shadow-md relative z-10" />
              <span className="font-black italic tracking-tighter text-3xl uppercase bg-gradient-to-br from-orange-400 to-orange-600 bg-clip-text text-transparent pr-1 -ml-2 relative z-0">DFIU</span>
            </Link>
            <div>
              <div className='flex items-center gap-2'>
                <h1 className='text-xl font-bold text-white'>{race.name}</h1>
                <button onClick={() => setShowEditModal(true)} className='text-neutral-400 hover:text-white'>
                  ✎
                </button>
              </div>
              {race.location && <p className='text-sm text-neutral-500'>{race.location}</p>}
            </div>
          </div>
          <div className='text-right'>
            {race.start_datetime && (
              <div className='text-white font-medium'>
                {formatDate(race.start_datetime, 'EEEE, MMMM d, yyyy')}
              </div>
            )}
            {race.distance_miles && (
              <div className='text-sm text-blue-500'>{race.distance_miles} miles</div>
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
          <div className='absolute inset-0 flex flex-col md:flex-row' style={{ height: 'calc(100vh - 130px)' }}>
            {coordinates.length > 0 ? (
              <>
                {/* Left Column: Map + Elevation */}
                <div className='flex-1 flex flex-col min-w-0 relative'>
                  <div className='flex-1 relative overflow-hidden'>
                    <CourseMap
                      coordinates={coordinates}
                      waypoints={waypoints.map(wp => ({
                        id: wp.id,
                        name: wp.name,
                        lat: wp.lat,
                        lon: wp.lon,
                        mile: wp.mile,
                        type: wp.type
                      }))}
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

                      terrainNodes={terrainNodes}
                      onTerrainNodeClick={(id) => {
                        const node = terrainNodes.find(n => n.id === id)
                        if (node) setEditingTerrainNode(node)
                      }}
                    />
                  </div>
                  <div className='h-20 flex-shrink-0 border-t border-neutral-800 bg-neutral-900 z-10 relative'>
                    <ElevationProfile
                      data={sampledProfile}
                      totalDistance={course?.total_distance_miles || 0}
                      onHover={setHoveredMile}
                      highlightDistance={hoveredMile ?? undefined}
                      showMileMarkers={showMileMarkers}
                      waypoints={waypoints.map(wp => ({ mile: wp.mile, name: wp.name, type: wp.type }))}
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
                          <div className='text-2xl font-bold text-white'>{(course.total_distance_miles ?? 0).toFixed(1)}</div>
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

                  <div className='p-4'>
                    <div className='flex items-center justify-between mb-4'>
                      <h3 className='text-sm font-semibold text-neutral-400 uppercase tracking-wider'>Waypoints</h3>
                      <div className="flex items-center gap-2">
                        <span className='text-xs bg-neutral-800 text-neutral-400 px-2 py-1 rounded-full'>{waypoints.length}</span>
                        <button
                          onClick={() => setEditingWaypoint({})}
                          className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors"
                        >
                          + Add
                        </button>
                      </div>
                    </div>

                    <div className='space-y-2'>
                      {waypoints.map((wp) => (
                        <div
                          key={wp.id}
                          className='p-3 bg-neutral-800/50 hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors group'
                          onClick={() => setEditingWaypoint(wp)}
                        >
                          <div className='flex items-start justify-between'>
                            <div className='flex items-center gap-2'>
                              <span className='text-blue-500 font-mono text-sm w-8 text-right'>{wp.mile.toFixed(1)}</span>
                              <span className='font-medium text-white'>{wp.name}</span>
                            </div>
                            <span className='text-xs text-neutral-600 group-hover:text-neutral-500'>{wp.type}</span>
                          </div>
                          {wp.cutoff_time && (
                            <div className='mt-1 ml-10 text-xs text-orange-400 font-mono'>
                              Cutoff: {(() => {
                                try {
                                  return new Intl.DateTimeFormat('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    timeZone: race?.timezone || undefined,
                                    timeZoneName: 'short'
                                  }).format(new Date(wp.cutoff_time))
                                } catch {
                                  return formatDate(wp.cutoff_time, 'p')
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                      {waypoints.length === 0 && (
                        <div className='text-center py-8 text-neutral-600 text-sm'>
                          Tap anywhere on the route line to add a waypoint.
                        </div>
                      )}
                    </div>

                    <div className='p-4 border-t border-neutral-800'>
                      <div className='flex items-center justify-between mb-4'>
                        <h3 className='text-sm font-semibold text-neutral-400 uppercase tracking-wider'>Terrain</h3>
                        <button
                          onClick={() => setEditingTerrainNode({})}
                          className="text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-2 py-1 rounded border border-neutral-700 transition-colors"
                        >
                          + Add Change
                        </button>
                      </div>
                      <div className="space-y-1">
                        {terrainNodes.length === 0 ? (
                          <p className="text-xs text-neutral-600 italic">No terrain segments defined. Entire course defaults to 'Dirt' (100%).</p>
                        ) : (
                          terrainNodes.map((node, i) => {
                            // Determine segment start
                            const startMile = i === 0 ? 0 : terrainNodes[i - 1].mile
                            return (
                              <div
                                key={node.id}
                                className="p-2 hover:bg-neutral-800 rounded cursor-pointer transition-colors text-xs text-neutral-400 flex justify-between items-center group"
                                onClick={() => setEditingTerrainNode(node)}
                              >
                                <div>
                                  <span className="text-neutral-500">{startMile.toFixed(1)} - {node.mile.toFixed(1)}m: </span>
                                  <span className="text-white font-medium capitalize">{node.type.replace('_', ' ')}</span>
                                </div>
                                <span className="bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-500 group-hover:text-white border border-neutral-800">
                                  {node.difficulty}%
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
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

                <div className="flex gap-4 mt-8">
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
          </div>
        )}

        {activeTab === 'plan' && (
          <div className='p-8 text-center text-neutral-500'>Pace planning coming in Epic 2...</div>
        )}

        {activeTab === 'docs' && (
          <div className='p-8 text-center text-neutral-500'>Documents and media coming in Epic 3...</div>
        )}
      </main>
      {editingTerrainNode && (
        <EditTerrainModal
          node={editingTerrainNode}
          onClose={() => setEditingTerrainNode(null)}
          onSave={handleSaveTerrainNode}
          onDelete={handleDeleteTerrainNode}
        />
      )}
    </div>
  )
}
