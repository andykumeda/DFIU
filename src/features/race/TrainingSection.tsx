import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Mountain, PencilLine, Route as RouteIcon, Upload } from 'lucide-react'
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
import { TrainingRouteDetailMap } from './TrainingRouteDetailMap'
import { TrainingRouteDetail } from './TrainingRouteDetail'
import { calculatePacePlan, isPaceChartWaypoint, type PacePlanResult } from './pace-utils'
import { usePacePlans, computePlanMinutes } from './usePacePlans'
import type { RunnerPacingProfile } from './runner-profile'
import { buildTrainingPlanSummary, formatDurationWords } from './training-analysis'

const TrainingRouteCreatorMap = lazy(() =>
  import('./TrainingRouteCreatorMap').then(module => ({ default: module.TrainingRouteCreatorMap }))
)

interface TrainingSectionProps {
  race: Race
  course: Course | null
  waypoints: Waypoint[]
  terrainNodes: TerrainNode[]
  clock24h?: boolean
  runnerProfile: RunnerPacingProfile
  resetToken?: number
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
  resetToken = 0,
}: TrainingSectionProps) {
  const {
    routes,
    loading,
    canEdit,
    createFromGpx,
    createManualRoute,
    updateRoute,
    deleteRoute,
  } = useTrainingRoutes(race.id, course?.geometry)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showUploader, setShowUploader] = useState(false)
  const [showCreator, setShowCreator] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftCoordinates, setDraftCoordinates] = useState<[number, number][]>([])
  const [showCourseReference, setShowCourseReference] = useState(true)
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
  const courseCoordinates = useMemo(
    () => (course ? extractCoordinates(course.geometry) : []),
    [course]
  )
  const aidStationReferences = useMemo(
    () => waypoints
      .filter(waypoint => waypoint.type === 'aid_station')
      .map(waypoint => ({ coordinates: [waypoint.lon, waypoint.lat] as [number, number], name: waypoint.name })),
    [waypoints]
  )

  useEffect(() => {
    setSelectedId(null)
  }, [resetToken])

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

  const handleCreate = async () => {
    setError(null)
    setUploading(true)
    try {
      const created = await createManualRoute(draftName, draftCoordinates)
      setDraftCoordinates([])
      setDraftName('')
      setShowCreator(false)
      if (created) setSelectedId(created.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create training route')
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
          planAGoalMinutes={planAMinutes}
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
        {canEdit && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setShowUploader(v => !v); setShowCreator(false) }} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Upload className="w-4 h-4" />{showUploader ? 'Cancel import' : 'Import GPX'}
          </button>
          <button type="button" onClick={() => { setShowCreator(v => !v); setShowUploader(false) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <PencilLine className="w-4 h-4" />{showCreator ? 'Cancel creation' : 'Create Route'}
          </button>
        </div>}
      </div>

      {showUploader && canEdit && (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <GpxUploader onUpload={handleUpload} disabled={uploading} />
          {uploading && <p className="text-sm text-neutral-400 mt-2">Saving route…</p>}
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </div>
      )}

      {showCreator && canEdit && (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block flex-1 min-w-52"><span className="text-xs uppercase tracking-wide text-neutral-500">Route name</span><input value={draftName} onChange={event => setDraftName(event.target.value)} placeholder="Morning trail loop" className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white" /></label>
            <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={showCourseReference} onChange={event => setShowCourseReference(event.target.checked)} className="accent-blue-500" />Show course & aid stations</label>
          </div>
          <p className="text-sm text-neutral-400">Click to set the start, then click each destination. Each new section snaps to the walking and trail network. The blue line is your route; gray is the race course and green markers are aid stations.</p>
          <Suspense fallback={<div className="h-80 md:h-[420px] rounded-lg bg-neutral-950 grid place-items-center text-sm text-neutral-500">Loading route editor…</div>}>
            <TrainingRouteCreatorMap coordinates={draftCoordinates} courseCoordinates={courseCoordinates} aidStations={aidStationReferences} showCourse={showCourseReference} onChange={setDraftCoordinates} />
          </Suspense>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-neutral-400">{draftCoordinates.length} point{draftCoordinates.length === 1 ? '' : 's'} added</span><div className="flex gap-2"><button type="button" onClick={() => setDraftCoordinates(points => points.slice(0, -1))} disabled={!draftCoordinates.length || uploading} className="px-3 py-2 rounded-lg text-sm text-neutral-300 hover:text-white disabled:opacity-50">Undo point</button><button type="button" onClick={() => setDraftCoordinates([])} disabled={!draftCoordinates.length || uploading} className="px-3 py-2 rounded-lg text-sm text-neutral-300 hover:text-white disabled:opacity-50">Clear</button><button type="button" onClick={() => void handleCreate()} disabled={draftCoordinates.length < 2 || uploading} className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white">{uploading ? 'Creating…' : 'Save route'}</button></div></div>
          {error && <p className="text-sm text-red-400">{error}</p>}
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
              ? 'Import a GPX file or create a route on the map. Overlap with the race course is calculated automatically.'
              : 'Race editors can add training routes here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {routes.map(route => (
              <TrainingRouteCard
                key={route.id}
                route={route}
                planA={planA}
                planAGoalMinutes={planAMinutes}
                race={race}
                clock24h={clock24h}
                courseCoordinates={courseCoordinates}
                onOpen={() => setSelectedId(route.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TrainingRouteCard({
  route,
  planA,
  planAGoalMinutes,
  race,
  clock24h,
  courseCoordinates,
  onOpen,
}: {
  route: TrainingRouteRow
  planA: PacePlanResult | null
  planAGoalMinutes: number
  race: Race
  clock24h: boolean
  courseCoordinates: [number, number][]
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
  const planSummary = buildTrainingPlanSummary(route.overlapSegments, planA, race, clock24h)
  const planGoalLabel = planAGoalMinutes > 0 ? ` (${formatDurationWords(planAGoalMinutes)} goal)` : ''

  return (
    <article className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden flex flex-col transition-colors">
      <button type="button" onClick={onOpen} className="text-left block w-full">
        <div className="h-44 bg-neutral-950 relative overflow-hidden">
          {coords.length >= 2 ? (
            <TrainingRouteDetailMap
              coordinates={coords}
              courseCoordinates={courseCoordinates.length >= 2 ? courseCoordinates : undefined}
              overlapSegments={route.overlapSegments}
              interactive={false}
              showControls={false}
              className="absolute inset-0 h-full w-full pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
              No map
            </div>
          )}
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-neutral-950 via-neutral-950/70 to-transparent px-4 pt-3 pb-10 pointer-events-none">
            <h3 className="text-lg font-semibold text-white truncate">{route.name}</h3>
          </div>
        </div>
        <div className="p-4 space-y-2">
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
          {planSummary && (
            <section className="pt-3 mt-3 border-t border-neutral-800 space-y-2" aria-label="Plan A segment">
              <h4 className="text-sm font-medium text-emerald-300">Plan A{planGoalLabel}</h4>
              <dl className="space-y-1.5 text-xs leading-5">
                <div className="flex justify-between gap-3 text-neutral-400"><dt>Race Segment Miles</dt><dd className="text-right text-neutral-200">{planSummary.raceMilesLabel} <span className="text-neutral-500">(Total: {planSummary.raceMilesTotal.toFixed(1)} mi)</span></dd></div>
                <div className="flex justify-between gap-3 text-neutral-400"><dt>Race Segment Time</dt><dd className="text-right text-neutral-200">{planSummary.raceTimeLabel ?? 'Generate Plan A'}{planSummary.raceDurationLabel && <span className="text-neutral-500"> (Total: {planSummary.raceDurationLabel})</span>}</dd></div>
                <div className="flex justify-between gap-3 text-neutral-400"><dt>Training Miles</dt><dd className="text-right text-neutral-200">{planSummary.trainingMilesLabel} <span className="text-neutral-500">(Total: {planSummary.trainingMilesTotal.toFixed(1)} mi)</span></dd></div>
              </dl>
            </section>
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
