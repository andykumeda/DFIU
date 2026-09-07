/** The configured total goal, never a segment duration or live projection. */
export function formatPlanALabel(goalMinutes: number): string {
  if (!Number.isFinite(goalMinutes) || goalMinutes <= 0) return 'Plan A (not set)'
  const minutes = Math.round(goalMinutes)
  return `Plan A (${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')})`
}
