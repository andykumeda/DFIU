import type { GpxParseResult } from '@/lib/gpx-parser'

export interface GpxRaceDraft {
  raceName: string
  racedAt: string | null
  distanceMi: number
  elevationGainFt: number
  finishMinutes: number | null
  movingMinutes: number | null
  hasTimestamps: boolean
}

export function raceDraftFromGpx(parsed: GpxParseResult, fileName: string): GpxRaceDraft {
  const allPoints = parsed.tracks.flatMap(track => track.points)
  const times = allPoints
    .map(point => (point.time ? Date.parse(point.time) : Number.NaN))
    .filter(value => Number.isFinite(value))
  const hasTimestamps = times.length >= 2
  const elapsedMinutes = hasTimestamps ? (times[times.length - 1] - times[0]) / 60000 : null
  const nameFromFile = fileName.replace(/^.*[/\\]/, '').replace(/\.gpx$/i, '').trim()
  const racedAt = times.length > 0 ? new Date(times[0]).toISOString().slice(0, 10) : null
  return {
    raceName: parsed.name?.trim() || parsed.tracks.find(track => track.name?.trim())?.name?.trim() || nameFromFile || 'Imported race',
    racedAt,
    distanceMi: parsed.stats.totalDistanceMiles,
    elevationGainFt: Math.max(0, Math.round(parsed.stats.totalElevationGainFt)),
    finishMinutes: elapsedMinutes != null && elapsedMinutes > 0 ? elapsedMinutes : null,
    movingMinutes: elapsedMinutes != null && elapsedMinutes > 0 ? elapsedMinutes : null,
    hasTimestamps,
  }
}

export function parseFinishTimeInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes(':')) {
    const [hours, minutes] = trimmed.split(':').map(part => Number(part))
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0) return null
    const total = hours * 60 + minutes
    return total > 0 ? total : null
  }
  const minutes = Number(trimmed)
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null
}
