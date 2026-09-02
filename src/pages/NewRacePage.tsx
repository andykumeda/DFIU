import { useState, useMemo, Suspense, lazy } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { RACE_SELECT } from '@/lib/race-select'
import { GpxUploader } from '@/features/course/GpxUploader'
import { ElevationProfile } from '@/features/course/ElevationProfile'
import { CourseStats } from '@/features/course/CourseStats'
import { GpxParseResult, sampleElevationProfile, getPointAtMile } from '@/lib/gpx-parser'
import { buildImportedWaypointRows } from '@/lib/gpx-waypoint-import'
import { SiteFooter } from '@/components/ui/SiteFooter'

const CourseMap = lazy(() =>
    import('@/features/course/CourseMap').then(m => ({ default: m.CourseMap }))
)

export default function NewRacePage() {
  const navigate = useNavigate()
  const [raceName, setRaceName] = useState('')
  const [website, setWebsite] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [gpxData, setGpxData] = useState<GpxParseResult | null>(null)
  const [rawGpx, setRawGpx] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredMile, setHoveredMile] = useState<number | null>(null)

  const handleGpxUpload = (result: GpxParseResult, raw: string) => {
    setGpxData(result)
    setRawGpx(raw)
    if (!raceName && result.name) {
      setRaceName(result.name)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }

      // Create race
      const raceData = {
        user_id: user.id,
        name: raceName,
        website_url: website || null,
        location: location || null,
        start_datetime: startDate && startTime
          ? new Date(`${startDate}T${startTime}`).toISOString()
          : startDate
            ? new Date(startDate).toISOString()
            : null,
        distance_miles: gpxData?.stats.totalDistanceMiles || null,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: race, error: raceError } = await (supabase.from('races') as any)
        .insert(raceData)
        // Column-level SELECT grants omit public_share_token; never select('*').
        .select(RACE_SELECT)
        .single()

      if (raceError) throw raceError

      const raceResult = race as { id: string }

      // Create course if GPX data exists
      if (gpxData && rawGpx) {
        const courseData = {
          race_id: raceResult.id,
          raw_gpx: rawGpx,
          geometry: { coordinates: gpxData.coordinates },
          elevation_samples: gpxData.elevationProfile,
          total_distance_miles: gpxData.stats.totalDistanceMiles,
          total_elevation_gain_ft: gpxData.stats.totalElevationGainFt,
          total_elevation_loss_ft: gpxData.stats.totalElevationLossFt,
          min_elevation_ft: gpxData.stats.minElevationFt,
          max_elevation_ft: gpxData.stats.maxElevationFt,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: course, error: courseError } = await (supabase.from('courses') as any)
          .insert(courseData)
          .select('id')
          .single()

        if (courseError) throw courseError

        const waypointRows = buildImportedWaypointRows(gpxData, course.id)
        if (waypointRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: waypointError } = await (supabase.from('waypoints') as any).insert(waypointRows)
          if (waypointError) throw waypointError
        }
      }

      navigate(`/race/${raceResult.id}`)
    } catch (err) {
      console.error('Failed to create race:', err)
      setError(err instanceof Error ? err.message : 'Failed to create race')
    } finally {
      setSaving(false)
    }
  }

  const sampledProfile = useMemo(() => gpxData
    ? sampleElevationProfile(gpxData.elevationProfile, 200)
    : [], [gpxData])

  const highlightPoint = useMemo(() => {
    if (hoveredMile === null || !gpxData) return null
    return getPointAtMile(gpxData, hoveredMile)
  }, [hoveredMile, gpxData])

  return (
    <div className='min-h-screen bg-neutral-950 text-white flex flex-col'>
      <header className='border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-10 p-4'>
        <div className='max-w-7xl mx-auto flex items-center gap-4'>
          <Link to='/dashboard' className='text-neutral-400 hover:text-white transition-colors'>
            ← Back
          </Link>
          <h1 className='text-xl font-bold'>New Race</h1>
        </div>
      </header>

      <main className='flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8'>
        <form onSubmit={handleSubmit} className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
          {/* Left Column - Form */}
          <div className='space-y-6'>
            <div>
              <label htmlFor='raceName' className='block text-sm font-medium text-neutral-300 mb-1'>Race Name *</label>
              <input
                id='raceName'
                type='text'
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                required
                placeholder='e.g., Western States 100'
                className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
              />
            </div>

            <div>
              <label htmlFor='website' className='block text-sm font-medium text-neutral-300 mb-1'>Race Website</label>
              <input
                id='website'
                type='url'
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder='https://...'
                className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
              />
            </div>

            <div>
              <label htmlFor='location' className='block text-sm font-medium text-neutral-300 mb-1'>Location</label>
              <input
                id='location'
                type='text'
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder='e.g., Squaw Valley, CA'
                className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
              />
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label htmlFor='startDate' className='block text-sm font-medium text-neutral-300 mb-1'>Race Date</label>
                <input
                  id='startDate'
                  type='date'
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
                />
              </div>
              <div>
                <label htmlFor='startTime' className='block text-sm font-medium text-neutral-300 mb-1'>Start</label>
                <input
                  id='startTime'
                  type='time'
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
                />
              </div>
            </div>

            {gpxData && (
              <CourseStats
                totalDistanceMiles={gpxData.stats.totalDistanceMiles}
                totalElevationGainFt={gpxData.stats.totalElevationGainFt}
                totalElevationLossFt={gpxData.stats.totalElevationLossFt}
                minElevationFt={gpxData.stats.minElevationFt}
                maxElevationFt={gpxData.stats.maxElevationFt}
              />
            )}

            {error && <div className='p-4 bg-red-900/20 border border-red-900/50 text-red-400 rounded-lg'>{error}</div>}

            <button
              type='submit'
              disabled={!raceName || saving}
              className='w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors'
            >
              {saving ? 'Creating...' : 'Create Race'}
            </button>
          </div>

          {/* Right Column - Map */}
          <div className='h-[600px] lg:h-auto bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden relative flex flex-col'>
            {gpxData ? (
              <>
                <div className='flex-1 relative'>
                  <Suspense fallback={
                    <div className="w-full h-full bg-neutral-900 animate-pulse rounded-xl flex items-center justify-center">
                      <div className="text-neutral-600">Loading map...</div>
                    </div>
                  }>
                    <CourseMap
                      coordinates={gpxData.coordinates}
                      // bounds={gpxData.bounds} // removed in refactor
                      highlightPoint={highlightPoint ? { lat: highlightPoint.lat, lon: highlightPoint.lon } : null}
                    />
                  </Suspense>
                  <button
                    type='button'
                    onClick={() => {
                      if (confirm('Replace current GPX file?')) {
                        setGpxData(null)
                        setRawGpx(null)
                        setHoveredMile(null)
                      }
                    }}
                    className='absolute top-4 right-4 bg-black/70 hover:bg-black text-white p-2 rounded-lg backdrop-blur-sm transition-colors'
                    title='Replace GPX'
                  >
                    🔄
                  </button>
                </div>
                <div className='h-40 border-t border-neutral-800'>
                  <ElevationProfile
                    data={sampledProfile}
                    totalDistance={gpxData.stats.totalDistanceMiles}
                    onHover={setHoveredMile}
                    highlightDistance={hoveredMile || undefined}
                  />
                </div>
              </>
            ) : (
              <div className='flex-1 flex flex-col items-center justify-center p-8'>
                <GpxUploader onUpload={handleGpxUpload} />
              </div>
            )}
          </div>
        </form>
      </main>
      <SiteFooter />
    </div>
  )
}
