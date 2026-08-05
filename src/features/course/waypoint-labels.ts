import { getDistance } from '@/lib/geo-utils'

/**
 * Helpers for map markers/labels of multi-visit aid stations (out-and-backs).
 * Stored waypoint names keep visit suffixes for Drop Bags / editing;
 * map text uses a shared base name so the view is not cluttered.
 */

/**
 * Stack visits that share nearly the same ground point. Out-and-back snaps often
 * differ by tens of meters (Shortcut Saddle ~50 m, Chilao ~15 m), so a tight
 * ~11 m degree epsilon misses them while Newcomb (~2 m) still grouped.
 */
export const MAP_WAYPOINT_STACK_RADIUS_MI = 0.06

/** Remove trailing visit markers like " 1", " #2", "(3)", or "(mi 42)". */
export function stripWaypointVisitSuffix(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  const stripped = trimmed
    .replace(/\s*\(mi\s*[\d.]+\)\s*$/i, '')
    .replace(/\s*\(\d+\)\s*$/u, '')
    .replace(/\s*[#-]?\d+\s*$/u, '')
    .trim()
  return stripped || trimmed
}

/**
 * Label text for a colocated waypoint stack on the map.
 * One shared base name when visit suffixes differ; otherwise unique bases joined.
 * Single visit-suffixed names also strip so a near-miss stack still reads cleanly.
 */
export function mapLabelForWaypointGroup(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return stripWaypointVisitSuffix(names[0])
  const bases = names.map(stripWaypointVisitSuffix)
  const unique = [...new Set(bases)]
  return unique.join(' / ')
}

type LonLatWaypoint = { lat: number; lon: number }

/** Group waypoints that fall within `radiusMi` of the group's first member. */
export function groupWaypointsByProximity<T extends LonLatWaypoint>(
  waypoints: readonly T[],
  radiusMi: number = MAP_WAYPOINT_STACK_RADIUS_MI
): T[][] {
  const groups: T[][] = []
  for (const wp of waypoints) {
    const existing = groups.find(
      g => getDistance(g[0].lat, g[0].lon, wp.lat, wp.lon) <= radiusMi
    )
    if (existing) existing.push(wp)
    else groups.push([wp])
  }
  return groups
}
