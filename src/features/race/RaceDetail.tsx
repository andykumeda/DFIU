import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CourseMap } from '@/features/course/CourseMap'
import { ElevationProfile } from '@/features/course/ElevationProfile'
import { CourseStats } from '@/features/course/CourseStats'
import { GpxUploader } from '@/features/course/GpxUploader'
import { EditRaceModal } from '@/features/race/EditRaceModal'
import { EditWaypointModal } from '@/features/course/EditWaypointModal'
import { sampleElevationProfile, type GpxParseResult } from '@/lib/gpx-parser'
import { getNearestPointOnLine, getDistanceFromStart } from '@/lib/geo-utils'
import type { Race, Course, Waypoint } from '@/types/database'
import { formatDate } from '@/lib/utils'

type Tab = 'overview' | 'map' | 'plan' | 'docs'

export function RaceDetail({ raceId }: { raceId: string }) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingWaypoint, setEditingWaypoint] = useState<Partial<Waypoint> | null>(null)

  // Data Fetching
  const { data: race, isLoading: raceLoading } = useQuery({
    queryKey: ['race', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('races').select('*').eq('id', raceId).single()
      if (error) throw error
      return data as Race
    }
  })

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
      if (course) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('courses') as any).update({
          raw_gpx: rawGpx,
          geometry: { coordinates: result.coordinates },
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
          geometry: { coordinates: result.coordinates },
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
          cutoff_time: data.cutoff_time,
          has_drop_bag: data.has_drop_bag,
          crew_allowed: data.crew_allowed,
          pacer_allowed: data.pacer_allowed,
          notes: data.notes
        }).eq('id', data.id)
        if (error) throw error
      } else {
        const maxOrder = Math.max(...waypoints.map(w => w.order_index), 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('waypoints') as any).insert({
          course_id: course?.id,
          name: data.name,
          type: data.type,
          lat: data.lat,
          lon: data.lon,
          mile: data.mile,
          order_index: maxOrder + 1,
          cutoff_time: data.cutoff_time,
          has_drop_bag: data.has_drop_bag,
          crew_allowed: data.crew_allowed,
          pacer_allowed: data.pacer_allowed,
          notes: data.notes
        })
        if (error) throw error
      }
      setEditingWaypoint(null)
      queryClient.invalidateQueries({ queryKey: ['waypoints', course?.id] })
    } catch (err) {
      console.error('Error saving waypoint:', err)
      alert('Failed to save waypoint')
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
      <header className='border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-10'>
        <div className='max-w-7xl mx-auto px-4 py-4 flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <Link to='/dashboard' className='text-neutral-400 hover:text-white transition-colors'>
              ← Dashboard
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
          <div className='absolute inset-0 flex flex-col md:flex-row'>
            {coordinates.length > 0 ? (
              <>
                <div className='flex-1 relative min-h-[50vh]'>
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
                  />
                </div>
                <div className='w-full md:w-80 bg-neutral-900 border-l border-neutral-800 p-4 overflow-y-auto'>
                  <ElevationProfile
                    data={sampledProfile}
                    totalDistance={course?.total_distance_miles || 0}
                  />
                  {course && (
                    <CourseStats
                      totalDistanceMiles={course.total_distance_miles || 0}
                      totalElevationGainFt={course.total_elevation_gain_ft || 0}
                      totalElevationLossFt={course.total_elevation_loss_ft || 0}
                      minElevationFt={course.min_elevation_ft || 0}
                      maxElevationFt={course.max_elevation_ft || 0}
                    />
                  )}
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
          <div className='p-8 text-center text-neutral-500'>Race overview and logistics coming soon...</div>
        )}

        {activeTab === 'plan' && (
          <div className='p-8 text-center text-neutral-500'>Pace planning coming in Epic 2...</div>
        )}

        {activeTab === 'docs' && (
          <div className='p-8 text-center text-neutral-500'>Documents and media coming in Epic 3...</div>
        )}
      </main>
    </div>
  )
}
