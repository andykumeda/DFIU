import { equivalentFlatPace } from './pace-prediction'

export const STRAVA_RACE_WORKOUT_TYPE = 1
export const STRAVA_RUNNING_SPORT_TYPES = ['Run', 'TrailRun', 'VirtualRun'] as const

export type StravaRunningSportType = (typeof STRAVA_RUNNING_SPORT_TYPES)[number]

export interface StravaActivityLike {
  id?: number
  name?: string
  sport_type?: string
  type?: string
  workout_type?: number | null
  distance?: number
  moving_time?: number
  elapsed_time?: number
  total_elevation_gain?: number
  start_date?: string | null
  start_date_local?: string | null
}

export interface StravaRaceSummary {
  id: number
  name: string
  sportType: string
  startDate: string | null
  distanceMeters: number
  movingSeconds: number
  elapsedSeconds: number
  elevationGainMeters: number
}

export interface StravaRaceHistoryDraft {
  stravaActivityId: number
  raceName: string
  racedAt: string | null
  distanceMi: number
  elevationGainFt: number
  finishMinutes: number
  movingMinutes: number
}

const METERS_PER_MILE = 1609.344
const METERS_TO_FEET = 3.28084
const SHORT_RACE_MILES = 10
const DEFAULT_SELECT_MILES = 13.1

export function isStravaRunningSport(sport: string | undefined): sport is StravaRunningSportType {
  return sport === 'Run' || sport === 'TrailRun' || sport === 'VirtualRun'
}

export function isStravaRaceActivity(activity: StravaActivityLike): boolean {
  const sport = activity.sport_type || activity.type
  if (!isStravaRunningSport(sport)) return false
  return activity.workout_type === STRAVA_RACE_WORKOUT_TYPE
}

export function summarizeStravaRace(activity: StravaActivityLike): StravaRaceSummary | null {
  const id = Number(activity.id)
  if (!Number.isFinite(id) || id <= 0 || !isStravaRaceActivity(activity)) return null
  const sport = activity.sport_type || activity.type || 'Run'
  const start = activity.start_date_local || activity.start_date || null
  return {
    id,
    name: typeof activity.name === 'string' && activity.name.trim() ? activity.name.trim() : 'Strava race',
    sportType: sport,
    startDate: typeof start === 'string' ? start : null,
    distanceMeters: Number(activity.distance) || 0,
    movingSeconds: Number(activity.moving_time) || 0,
    elapsedSeconds: Number(activity.elapsed_time) || 0,
    elevationGainMeters: Number(activity.total_elevation_gain) || 0,
  }
}

export function stravaRaceToHistoryDraft(race: StravaRaceSummary): StravaRaceHistoryDraft | null {
  const distanceMi = race.distanceMeters / METERS_PER_MILE
  const movingMinutes = race.movingSeconds / 60
  const finishMinutes = (race.elapsedSeconds || race.movingSeconds) / 60
  if (!(distanceMi > 0) || !(finishMinutes > 0)) return null
  const racedAt = race.startDate ? race.startDate.slice(0, 10) : null
  return {
    stravaActivityId: race.id,
    raceName: race.name,
    racedAt,
    distanceMi,
    elevationGainFt: Math.max(0, Math.round(race.elevationGainMeters * METERS_TO_FEET)),
    finishMinutes,
    movingMinutes: movingMinutes > 0 ? movingMinutes : finishMinutes,
  }
}

/** Prefer longer / trail races; leave short road races unchecked by default. */
export function shouldDefaultSelectStravaRace(race: StravaRaceSummary): boolean {
  const miles = race.distanceMeters / METERS_PER_MILE
  if (!(miles > 0) || miles < SHORT_RACE_MILES) return false
  if (race.sportType === 'TrailRun') return true
  return miles >= DEFAULT_SELECT_MILES
}

export function equivalentPaceForRace(draft: StravaRaceHistoryDraft): number {
  return equivalentFlatPace(draft.distanceMi, draft.movingMinutes, draft.elevationGainFt)
}
