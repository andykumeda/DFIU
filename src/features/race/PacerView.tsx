import { Navigate, useLocation } from 'react-router-dom'

/** Keep existing pacer links pointing at the event's support-aware tab. */
export function PacerView({ raceId }: { raceId: string }) {
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  search.set('tab', 'pacer')
  return <Navigate to={`/race/${raceId}?${search}`} replace />
}
