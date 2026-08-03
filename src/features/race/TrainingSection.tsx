import { useEffect, useState } from 'react'
import { ExternalLink, Mountain, Route as RouteIcon, Upload } from 'lucide-react'
import type { Course, Race, TerrainNode, Waypoint } from '@/types/database'
import { GpxUploader } from '@/features/course/GpxUploader'
import type { GpxParseResult } from '@/lib/gpx-parser'
import {
  directionsUrl,
  extractCoordinates,
  formatOverlapSummary,
  isPointToPointRoute,
  returnDirectionsUrl,
} from '@/lib/training-overlap'
import { useTrainingRoutes, type TrainingRouteRow } from './useTrainingRoutes'
import { TrainingRouteSvgPreview } from './TrainingRouteDetailMap'
import { TrainingRouteDetail } from './TrainingRouteDetail'
import { calculatePacePlan, isPaceChartWaypoint, type PacePlanResult } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import type { RunnerPacingProfile } from './runner-profile'
import { getOverlapRacePace } from './race-day-utils'

interface TrainingSectionProps {
  race: Race
  course: Course | null
  waypoints: Waypoint[]
  terrainNodes: TerrainNode[]
  clock24h?: boolean
  runnerProfile: RunnerPacingProfile
}

function truncateNotes(notes: string | null, max = 100): string | null {
  if (!notes?.trim()) return null
  const t = notes.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export function TrainingSection({
  race,
  course,
  waypoints,
  terrainNodes,
  clock24h = false,
  runnerProfile,
}: TrainingSectionProps) {
  const {
    routes,
    loading,
    canEdit,
    createFromGpx,
    updateRoute,
    deleteRoute,
  } = useTrainingRoutes(race.id, course?.geometry)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showUploader, setShowUploader] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { plans } = usePacePlans(race.id)
  const { a: planAMinutes } = computePlanMinutes(plans, race.overall_cutoff)
  const [planA, setPlanA] = useState<PacePlanResult | null>(null)

  useEffect(() => {
    if (!plans.hasCalculated || !course?.elevation_samples || !(planAMinutes > 0)) {
      const handle = setTimeout(() => setPlanA(null), 0)
      return () => clearTimeout(handle)
    }
    const handle = setTimeout(() => {
      const samples = course.elevation_samples as { distance: number; elevation: number }[]
      const totalDist = course.total_distance_miles || 0
      const paceWaypoints = waypoints.filter(isPaceChartWaypoint)
      setPlanA(
        calculatePacePlan(
          samples,
          totalDist,
          paceWaypoints,
          terrainNodes,
          { mode: 'time', value: planAMinutes },
          race,
          clock24h,
          [],
          runnerProfile,
          runnerProfile.aidStationDefaultDelay
        )
      )
    }, 0)
    return () => clearTimeout(handle)
  }, [
    plans.hasCalculated,
    planAMinutes,
    course,
    waypoints,
    terrainNodes,
    race,
    clock24h,
    runnerProfile,
  ])

  const planAReady = plans.hasCalculated && planA != null
  const selected = selectedId ? routes.find(r => r.id === selectedId) ?? null : null

  const handleUpload = async (result: GpxParseResult, rawGpx: string, fileName: string) => {
    setError(null)
    setUploading(true)
    try {
      const created = await createFromGpx(result, rawGpx, fileName)
      setShowUploader(false)
      if (created) setSelectedId(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save training route')
    } finally {
      setUploading(false)
    }
  }

  if (selected) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <TrainingRouteDetail
          route={selected}
          course={course}
          race={race}
          canEdit={canEdit}
          planA={planA}
          planAReady={planAReady}
          clock24h={clock24h}
          onBack={() => setSelectedId(null)}
          onUpdate={updateRoute}
          onDelete={deleteRoute}
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <RouteIcon className="w-6 h-6 text-blue-400" />
            Training Routes
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            GPX routes to prepare for the event, with automatic course-overlap detection.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowUploader(v => !v)}
            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            {showUploader ? 'Cancel' : 'Import GPX'}
          </button>
        )}
      </div>

      {showUploader && canEdit && (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <GpxUploader onUpload={handleUpload} disabled={uploading} />
          {uploading && <p className="text-sm text-neutral-400 mt-2">Saving route…</p>}
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </div>
      )}

      {loading ? (
        <p className="text-neutral-400 py-12 text-center">Loading training routes…</p>
      ) : routes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-500 border-2 border-dashed border-neutral-800 rounded-xl my-6">
          <RouteIcon className="w-12 h-12 mb-4 opacity-20" />
          <h3 className="text-xl font-medium text-white mb-2">No training routes yet</h3>
          <p className="max-w-md">
            {canEdit
              ? 'Import a GPX file to add a training route. Overlap with the race course is calculated automatically.'
              : 'Race editors can import GPX training routes here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {routes.map(route => (
            <TrainingRouteCard
              key={route.id}
              route={route}
              planA={planA}
              planAReady={planAReady}
              race={race}
              clock24h={clock24h}
              onOpen={() => setSelectedId(route.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TrainingRouteCard({
  route,
  planA,
  planAReady,
  race,
  clock24h,
  onOpen,
}: {
  route: TrainingRouteRow
  planA: PacePlanResult | null
  planAReady: boolean
  race: Race
  clock24h: boolean
  onOpen: () => void
}) {
  const coords = extractCoordinates(route.geometry)
  const notesPreview = truncateNotes(route.notes)
  const hasStart =
    route.start_lat != null &&
    route.start_lon != null &&
    Number.isFinite(route.start_lat) &&
    Number.isFinite(route.start_lon)
  const hasFinish =
    route.finish_lat != null &&
    route.finish_lon != null &&
    Number.isFinite(route.finish_lat) &&
    Number.isFinite(route.finish_lon)
  const isP2P =
    hasStart &&
    hasFinish &&
    isPointToPointRoute(route.start_lat, route.start_lon, route.finish_lat, route.finish_lon)

  const primarySeg = route.overlapSegments[0]
  const overlapPace =
    planAReady && primarySeg
      ? getOverlapRacePace(planA, primarySeg.courseStartMi, primarySeg.courseEndMi, race, clock24h)
      : null

  return (
    <article className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden flex flex-col transition-colors">
      <button type="button" onClick={onOpen} className="text-left block w-full">
        <div className="h-36 bg-neutral-950 relative">
          {coords.length >= 2 ? (
            <TrainingRouteSvgPreview coordinates={coords} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
              No map
            </div>
          )}
        </div>
        <div className="p-4 space-y-2">
          <h3 className="text-lg font-semibold text-white truncate">{route.name}</h3>
          <div className="flex flex-wrap gap-3 text-sm text-neutral-400">
            <span>
              {route.distance_miles != null ? `${route.distance_miles.toFixed(1)} mi` : '—'}
            </span>
            <span className="flex items-center gap-1">
              <Mountain className="w-3.5 h-3.5" />
              {route.elevation_gain_ft != null
                ? `+${Math.round(route.elevation_gain_ft).toLocaleString()} ft`
                : '—'}
            </span>
          </div>
          <p className="text-sm text-orange-300/90">
            {formatOverlapSummary(route.overlap_miles, route.overlapSegments)}
          </p>
          {overlapPace && (
            <p className="text-sm text-emerald-400/90">
              Plan A {overlapPace.paceLabel}/mi
              {overlapPace.enterTimeOfDay ? ` · ~${overlapPace.enterTimeOfDay}` : ''}
            </p>
          )}
          {notesPreview && (
            <p className="text-sm text-neutral-500 line-clamp-2">{notesPreview}</p>
          )}
        </div>
      </button>
      {(hasStart || isP2P) && (
        <div className="px-4 pb-4 flex flex-col gap-1.5">
          {hasStart && (
            <a
              href={directionsUrl(route.start_lat!, route.start_lon!)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Directions to start
            </a>
          )}
          {isP2P && (
            <>
              <a
                href={directionsUrl(route.finish_lat!, route.finish_lon!)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Directions to finish
              </a>
              <a
                href={returnDirectionsUrl(
                  route.finish_lat!,
                  route.finish_lon!,
                  route.start_lat!,
                  route.start_lon!
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Finish → start (return)
              </a>
            </>
          )}
        </div>
      )}
    </article>
  )
}
