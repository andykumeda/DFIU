export type StravaQueryIntent =
  | 'zones'
  | 'profile'
  | 'stats'
  | 'routes'
  | 'segments'
  | 'activities'
  | 'unknown'

/**
 * Classify only requests the query endpoint can answer directly. In
 * particular, do not treat every sentence containing "run" as a request for
 * the activity feed: that made unrelated questions silently return 10 runs.
 */
export function classifyStravaQueryIntent(query: string): StravaQueryIntent {
  const normalized = query.trim().toLowerCase()

  if (/\bzones?\b/.test(normalized)) return 'zones'
  if (/\bprofile\b|\bwho am i\b/.test(normalized)) return 'profile'
  if (/\bstats?\b|\bstatistics\b/.test(normalized)) return 'stats'
  if (/\broutes?\b/.test(normalized)) return 'routes'
  if (/\bsegments?\b/.test(normalized)) return 'segments'

  if (
    /\bactivit(?:y|ies)\b/.test(normalized) ||
    /\b(?:recent|latest)\s+(?:runs?|rides?|activities)\b/.test(normalized) ||
    /\bmy\s+(?:runs?|rides?)\b/.test(normalized)
  ) {
    return 'activities'
  }

  return 'unknown'
}
