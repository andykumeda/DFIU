export type StravaQueryKind = 'activities' | 'profile' | 'stats' | 'zones' | 'activity' | 'api'

export interface StravaApiRequest {
  method: 'GET'
  path: string
}

export interface StravaQueryActivity {
  id: number
  name: string
  type?: string
  distanceMiles?: number | null
  movingSeconds?: number
  startDate?: string | null
}

export interface StravaQueryResponse {
  kind: StravaQueryKind
  answer: string
  activities?: StravaQueryActivity[]
  profile?: Record<string, unknown>
  stats?: Record<string, unknown>
  zones?: Record<string, unknown>
  activity?: {
    id: number
    name: string
    elapsedSeconds: number
    movingSeconds: number
    distanceMiles: number | null
    startDate: string | null
  }
  data?: unknown
}

export function normalizeStravaQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

/** Parse the read-only advanced request form without allowing absolute URLs or path traversal. */
export function parseStravaApiRequest(query: string): StravaApiRequest | null {
  const match = normalizeStravaQuery(query).match(/^(GET)\s+(\/[^\s]+)$/i)
  if (!match) return null
  const method = 'GET'
  const path = match[2]
  if (path.includes('..') || path.includes('//')) return null
  return { method, path }
}

export function formatDistanceMiles(distanceMiles: number | null | undefined): string {
  return distanceMiles != null && Number.isFinite(distanceMiles)
    ? `${distanceMiles.toFixed(1)} mi`
    : 'distance unavailable'
}

export function formatMovingTime(seconds: number | undefined): string {
  if (!(seconds != null && Number.isFinite(seconds) && seconds >= 0)) return 'time unavailable'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
