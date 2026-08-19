import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, ExternalLink, MapPin, Mountain, Route as RouteIcon, Share2, Trash2 } from 'lucide-react'
import type { Course, Json, Race } from '@/types/database'
import { parseGpxWaypoints, sampleElevationProfile } from '@/lib/gpx-parser'
import type { TrainingRouteRow } from './useTrainingRoutes'
import { TrainingRouteDetailMap } from './TrainingRouteDetailMap'
import { ElevationProfile } from '@/features/course/ElevationProfile'
import { trainingElevationWaypoints } from './training-map-waypoints'
import {
  directionsUrl,
  extractCoordinates,
  formatOverlapSummary,
  courseOverlapElevationGainFt,
  isPointToPointRoute,
  mergeContinuousOverlapSegments,
  returnDirectionsUrl,
} from '@/lib/training-overlap'
import type { PacePlanResult } from './pace-utils'
import { formatHM, getOverlapRacePace } from './race-day-utils'
import { isSameTrainingOverlap, sortOverlapSegmentsByRaceMile } from './training-analysis'
import { TrainingAnalysisPanel, type StravaActivity } from './TrainingAnalysisPanel'

interface TrainingRouteDetailProps {
  route: TrainingRouteRow
  course: Course | null
  race: Race
  canEdit: boolean
  planA: PacePlanResult | null
  planAReady: boolean
  planAGoalMinutes: number
  clock24h?: boolean
  courseElevationSamples?: { distance: number; elevation: number }[] | null
  onBack: () => void
  onUpdate: (id: string, patch: { name?: string; notes?: string | null; strava_activity_inputs?: string[]; strava_activity_results?: Json }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TrainingRouteDetail({
  route,
  course,
  race,
  canEdit,
  planA,
  planAReady,
  planAGoalMinutes,
  clock24h = false,
  courseElevationSamples = null,
  onBack,
  onUpdate,
  onDelete,
}: TrainingRouteDetailProps) {
  const [name, setName] = useState(route.name)
  const [notes, setNotes] = useState(route.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [showCourseRoute, setShowCourseRoute] = useState(true)
  const [hoveredTrainingMile, setHoveredTrainingMile] = useState<number | null>(null)
  const [highlightedOverlap, setHighlightedOverlap] = useState<{
    trainingStartMi: number
    trainingEndMi: number
  } | null>(null)
  const mapSectionRef = useRef<HTMLDivElement>(null)

  const trainingCoords = useMemo(() => extractCoordinates(route.geometry), [route.geometry])
  const courseCoords = useMemo(
    () => (course ? extractCoordinates(course.geometry) : []),
    [course]
  )
  const trainingWaypoints = useMemo(
    () => parseGpxWaypoints(route.raw_gpx ?? ''),
    [route.raw_gpx]
  )
  const elevationProfile = useMemo(() => {
    if (!Array.isArray(route.elevation_samples)) return []
    return route.elevation_samples.flatMap(sample => {
      if (!sample || typeof sample !== 'object' || Array.isArray(sample)) return []
      const distance = Number((sample as { distance?: unknown }).distance)
      const elevation = Number((sample as { elevation?: unknown }).elevation)
      return Number.isFinite(distance) && Number.isFinite(elevation) ? [{ distance, elevation }] : []
    })
  }, [route.elevation_samples])
  const sampledElevationProfile = useMemo(
    () => sampleElevationProfile(elevationProfile, 200),
    [elevationProfile]
  )
  const trainingDistance = route.distance_miles
    ?? elevationProfile[elevationProfile.length - 1]?.distance
    ?? 0
  const elevationWaypoints = useMemo(
    () => trainingElevationWaypoints(trainingWaypoints, trainingCoords, trainingDistance),
    [trainingWaypoints, trainingCoords, trainingDistance]
  )
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
  const orderedOverlapSegments = useMemo(
    () => sortOverlapSegmentsByRaceMile(
      mergeContinuousOverlapSegments(route.overlapSegments).filter(
        segment => Math.abs(segment.courseEndMi - segment.courseStartMi) >= 0.25
      )
    ),
    [route.overlapSegments]
  )
  const overlapElevFt = useMemo(
    () => courseOverlapElevationGainFt(courseElevationSamples, route.overlapSegments),
    [courseElevationSamples, route.overlapSegments]
  )

  const dirty = name.trim() !== route.name || notes !== (route.notes ?? '')

  const selectOverlap = (segment: { trainingStartMi: number; trainingEndMi: number }) => {
    setHighlightedOverlap(current => (isSameTrainingOverlap(current, segment) ? null : segment))
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const handleExport = () => {
    const gpx = route.raw_gpx?.trim() || buildTrainingRouteGpx(route.name, trainingCoords)
    if (!gpx) return
    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${route.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'training_route'}.gpx`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const handleShare = async () => {
    const url = new URL(window.location.href)
    url.searchParams.set('training', route.id)
    const shareData = { url: url.toString() }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareState('copied')
        return
      }
      await navigator.clipboard.writeText(url.toString())
      setShareState('copied')
    } catch (error) {
      // A cancelled native share is not an error worth surfacing.
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareState('error')
    }
  }

  const handleSave = async () => {
    if (!canEdit || !dirty) return
    setSaving(true)
    try {
      await onUpdate(route.id, {
        name: name.trim() || route.name,
        notes: notes.trim() ? notes.trim() : null,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canEdit) return
    if (!confirm(`Delete training route “${route.name}”?`)) return
    setDeleting(true)
    try {
      await onDelete(route.id)
      onBack()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All training routes
        </button>
        <div className="flex items-center gap-3">
          {canEdit && dirty && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="text-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
          <button
            type='button'
            onClick={handleExport}
            className='flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300'
          >
            <Download className='w-4 h-4' />
            Export GPX
          </button>
          <button
            type='button'
            onClick={() => void handleShare()}
            className='flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300'
          >
            <Share2 className='w-4 h-4' />
            {shareState === 'copied' ? 'Link ready' : shareState === 'error' ? 'Copy failed' : 'Share route'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input type="checkbox" checked={showCourseRoute} onChange={event => setShowCourseRoute(event.target.checked)} className="accent-blue-500" />
          Show race course
        </label>
        <div ref={mapSectionRef} className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
          <div className="h-[360px] md:h-[420px]">
            <TrainingRouteDetailMap
              coordinates={trainingCoords}
              courseCoordinates={showCourseRoute && courseCoords.length >= 2 ? courseCoords : undefined}
              waypoints={trainingWaypoints}
              overlapSegments={route.overlapSegments}
              highlightedOverlap={highlightedOverlap}
              highlightMile={hoveredTrainingMile ?? undefined}
              onHoverMile={setHoveredTrainingMile}
              showLegend
              className="w-full h-full"
            />
          </div>
          <div
            className="h-32 md:h-40 border-t border-neutral-800 bg-neutral-900"
            aria-label="Training route elevation profile"
          >
            <ElevationProfile
              data={sampledElevationProfile}
              totalDistance={trainingDistance}
              onHover={setHoveredTrainingMile}
              highlightDistance={hoveredTrainingMile ?? undefined}
              showMileMarkers
              waypoints={elevationWaypoints}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 max-w-3xl">
        {canEdit ? (
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Name</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
            />
          </label>
        ) : (
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <RouteIcon className="w-6 h-6 text-blue-400" />
            {route.name}
          </h2>
        )}

        {canEdit ? (
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Description</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Water sources, restrooms, parking tips, trail notes…"
              className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm resize-y min-h-[100px]"
            />
          </label>
        ) : (
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Description</div>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap">
              {route.notes?.trim() || 'No description yet.'}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-neutral-300">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-neutral-500" />
            {route.distance_miles != null ? `${route.distance_miles.toFixed(1)} mi` : '—'}
          </span>
          <span className="flex items-center gap-1.5">
            <Mountain className="w-4 h-4 text-neutral-500" />
            {route.elevation_gain_ft != null
              ? `+${Math.round(route.elevation_gain_ft).toLocaleString()} ft`
              : '—'}
          </span>
        </div>

        {(hasStart || isP2P) && (
          <div className="flex flex-col gap-2">
            {hasStart && (
              <a
                href={directionsUrl(route.start_lat!, route.start_lon!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-4 h-4" />
                Directions to start
              </a>
            )}
            {isP2P && (
              <>
                <a
                  href={directionsUrl(route.finish_lat!, route.finish_lon!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
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
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-4 h-4" />
                  Finish → start (return / shuttle)
                </a>
              </>
            )}
          </div>
        )}

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Course overlap</div>
          <p className="text-sm text-neutral-200">
            {formatOverlapSummary(route.overlap_miles, route.overlapSegments, {
              elevationGainFt: overlapElevFt,
            })}
          </p>
          {orderedOverlapSegments.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm text-neutral-400">
              {orderedOverlapSegments.map((seg, i) => {
                const pace = planAReady
                  ? getOverlapRacePace(
                      planA,
                      seg.courseStartMi,
                      seg.courseEndMi,
                      race,
                      clock24h
                    )
                  : null
                const selected = isSameTrainingOverlap(highlightedOverlap, seg)
                return (
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectOverlap(seg)}
                      className={`w-full text-left rounded-lg px-3 py-2 space-y-1 transition-colors ${
                        selected
                          ? 'bg-yellow-400/15 border border-yellow-400/50 text-neutral-200'
                          : 'border border-transparent hover:bg-neutral-800/70 hover:text-neutral-200'
                      }`}
                    >
                      <div>
                        Course mi {seg.courseStartMi.toFixed(1)}–{seg.courseEndMi.toFixed(1)}
                        <span className="text-neutral-600">
                          {' '}
                          (training {seg.trainingStartMi.toFixed(1)}–{seg.trainingEndMi.toFixed(1)})
                        </span>
                      </div>
                      {pace && (
                        <div className="text-emerald-400/95 text-sm">
                          Plan A{' '}
                          {pace.enterTimeOfDay && pace.exitTimeOfDay
                            ? `${pace.enterTimeOfDay} – ${pace.exitTimeOfDay} (${formatHM(pace.durationMin)})`
                            : `(${formatHM(pace.durationMin)})`}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {route.overlapSegments.length > 0 && !planAReady && (
            <p className="mt-3 text-xs text-neutral-500">
              Set a valid Plan A goal on the Pace tab to see predicted time of day for this overlap.
            </p>
          )}
        </div>
        <TrainingAnalysisPanel
          routes={[route]}
          planA={planA}
          planAGoalMinutes={planAGoalMinutes}
          race={race}
          clock24h={clock24h}
          hideRoutePicker
          highlightedOverlap={highlightedOverlap}
          onHighlightOverlap={selectOverlap}
          savedActivityInputs={Array.isArray(route.strava_activity_inputs) ? route.strava_activity_inputs.filter((value): value is string => typeof value === 'string') : []}
          savedActivityResults={Array.isArray(route.strava_activity_results) ? route.strava_activity_results as unknown as StravaActivity[] : []}
          onSaveActivityInputs={inputs => onUpdate(route.id, { strava_activity_inputs: inputs })}
          onSaveActivityResults={results => onUpdate(route.id, { strava_activity_results: results as unknown as Json })}
        />
      </div>
    </div>
  )
}

function buildTrainingRouteGpx(name: string, coordinates: [number, number][]) {
  if (coordinates.length < 2) return ''
  const escapeXml = (value: string) => value.replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character)
  const trackPoints = coordinates
    .map(([lon, lat]) => `      <trkpt lat='${lat}' lon='${lon}' />`)
    .join('\n')
  return `<?xml version='1.0' encoding='UTF-8'?>
<gpx version='1.1' creator='DFIU' xmlns='http://www.topografix.com/GPX/1/1'>
  <metadata><name>${escapeXml(name)}</name></metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>
`
}
