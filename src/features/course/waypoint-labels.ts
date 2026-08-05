/**
 * Helpers for map labels of multi-visit aid stations (out-and-backs).
 * Stored waypoint names keep visit suffixes for Drop Bags / editing;
 * map text uses a shared base name so the view is not cluttered.
 */

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
 */
export function mapLabelForWaypointGroup(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  const bases = names.map(stripWaypointVisitSuffix)
  const unique = [...new Set(bases)]
  return unique.join(' / ')
}
