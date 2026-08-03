import { useState } from 'react'
import { ArrowLeft, ExternalLink, MapPin, Mountain, Route as RouteIcon, Trash2 } from 'lucide-react'
import type { Course } from '@/types/database'
import type { TrainingRouteRow } from './useTrainingRoutes'
import { TrainingRouteDetailMap } from './TrainingRouteDetailMap'
import {
  directionsUrl,
  extractCoordinates,
  formatOverlapSummary,
  isPointToPointRoute,
  returnDirectionsUrl,
} from '@/lib/training-overlap'

interface TrainingRouteDetailProps {
  route: TrainingRouteRow
  course: Course | null
  canEdit: boolean
  onBack: () => void
  onUpdate: (id: string, patch: { name?: string; notes?: string | null }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function TrainingRouteDetail({
  route,
  course,
  canEdit,
  onBack,
  onUpdate,
  onDelete,
}: TrainingRouteDetailProps) {
  const [name, setName] = useState(route.name)
  const [notes, setNotes] = useState(route.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const trainingCoords = extractCoordinates(route.geometry)
  const courseCoords = course ? extractCoordinates(course.geometry) : []
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

  const dirty = name.trim() !== route.name || notes !== (route.notes ?? '')

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
      </div>

      <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950 h-[360px] md:h-[420px]">
        <TrainingRouteDetailMap
          coordinates={trainingCoords}
          courseCoordinates={courseCoords.length >= 2 ? courseCoords : undefined}
          overlapSegments={route.overlapSegments}
          className="w-full h-full"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
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
              {formatOverlapSummary(route.overlap_miles, route.overlapSegments)}
            </p>
            {route.overlapSegments.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-neutral-400">
                {route.overlapSegments.map((seg, i) => (
                  <li key={i}>
                    Course mi {seg.courseStartMi.toFixed(1)}–{seg.courseEndMi.toFixed(1)}
                    <span className="text-neutral-600">
                      {' '}
                      (training {seg.trainingStartMi.toFixed(1)}–{seg.trainingEndMi.toFixed(1)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-neutral-500 flex items-center gap-2">
              <span className="inline-block w-3 h-1 rounded bg-neutral-500" /> race course
              <span className="inline-block w-3 h-1 rounded bg-blue-500" /> training
              <span className="inline-block w-3 h-1 rounded bg-orange-500" /> overlap
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Notes</span>
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
          </div>
          {canEdit ? (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={10}
              placeholder="Water sources, restrooms, parking tips, trail notes…"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm resize-y min-h-[160px]"
            />
          ) : (
            <p className="text-sm text-neutral-300 whitespace-pre-wrap min-h-[80px]">
              {route.notes?.trim() || 'No notes yet.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
