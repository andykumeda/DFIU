import type { Race, TerrainNode, Waypoint } from '@/types/database'
import type { RunnerPacingProfile } from './runner-profile'

export const PACE_MODEL_VERSION = 'terrain-hybrid-v1.2'

export interface RunnerHistoryEntry {
  distanceMi: number
  elevationGainFt?: number
  finishMinutes: number
  movingMinutes?: number
  racedAt?: string
  terrainDifficulty?: number
  altitudeFt?: number
}

export interface PaceModelInput {
  courseProfile: { distance: number; elevation: number }[]
  totalDistance: number
  terrainNodes: Pick<TerrainNode, 'mile' | 'difficulty' | 'type'>[]
  waypoints: Pick<Waypoint, 'id' | 'mile' | 'delay' | 'type' | 'has_drop_bag' | 'crew_allowed' | 'pacer_allowed'>[]
  race: Partial<Race>
  baselineFlatPace?: number
  history?: RunnerHistoryEntry[]
  runnerProfile?: RunnerPacingProfile
  aidStationDefaultDelay?: number
  now?: Date
}

export interface PaceFactorAttribution {
  mile: number
  distance: number
  grade: number
  terrain: number
  conditions: number
  total: number
}

export interface PacePrediction {
  modelVersion: string
  p10TotalMinutes: number
  p50TotalMinutes: number
  p90TotalMinutes: number
  p50MovingMinutes: number
  p50StoppedMinutes: number
  confidence: 'low' | 'medium' | 'high'
  calibratedFlatPace: number
  factorAttributions: PaceFactorAttribution[]
}

function gradeFactor(gradient: number) {
  const i = Math.max(-0.45, Math.min(0.45, gradient))
  const cost = 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6
  return Math.max(0.5, cost / 3.6)
}

function terrainAt(mile: number, nodes: PaceModelInput['terrainNodes']) {
  let active: PaceModelInput['terrainNodes'][number] | undefined
  for (const node of nodes) {
    if (node.mile <= mile) active = node
    else break
  }
  return active
}

function supportsDelay(wp: PaceModelInput['waypoints'][number]) {
  return wp.type !== 'start' && wp.type !== 'finish' && wp.type !== 'landmark'
}

export function equivalentFlatPace(distanceMi: number, minutes: number, elevationGainFt = 0) {
  // ITRA km-effort: 100 m of ascent adds 1 km of equivalent distance.
  // In imperial units this is one effort mile per 528 ft of ascent.
  const effortMi = distanceMi + Math.max(0, elevationGainFt) / 528
  return minutes / effortMi
}

/** Favor comparable distances in both directions; multi-day races are not 100-mile equivalents. */
export function historyDistanceSimilarity(historyMi: number, targetMi: number) {
  if (!Number.isFinite(historyMi) || !Number.isFinite(targetMi) || !(historyMi > 0) || !(targetMi > 0)) return 0
  return (Math.min(historyMi, targetMi) / Math.max(historyMi, targetMi)) ** 2
}

function historyBaseline(history: RunnerHistoryEntry[], fallback: number, now: Date, targetMi: number) {
  const observations: { pace: number; weight: number }[] = []
  for (const item of history) {
    if (!Number.isFinite(item.distanceMi) || item.distanceMi <= 0 || !Number.isFinite(item.finishMinutes) || item.finishMinutes <= 0) continue
    const minutes = item.movingMinutes ?? item.finishMinutes
    const gain = item.elevationGainFt ?? 0
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > item.finishMinutes || !Number.isFinite(gain) || gain < 0) continue
    const timestamp = item.racedAt ? new Date(item.racedAt).getTime() : now.getTime() - 365 * 86400000
    if (!Number.isFinite(timestamp)) continue
    const ageDays = Math.max(0, (now.getTime() - timestamp) / 86400000)
    const weight = Math.exp(-ageDays / 365) * historyDistanceSimilarity(item.distanceMi, targetMi)
    if (weight > 0) observations.push({ pace: equivalentFlatPace(item.distanceMi, minutes, gain), weight })
  }
  const evidence = observations.reduce((sum, item) => sum + item.weight, 0)
  if (evidence === 0) return { pace: fallback, evidence: 0, spread: 0.18 }
  const pace = observations.reduce((sum, item) => sum + item.pace * item.weight, 0) / evidence
  const variance = observations.reduce((sum, item) => sum + item.weight * (item.pace - pace) ** 2, 0) / evidence
  // Summary-only history cannot establish high confidence. Disagreement must
  // widen the planning band, even when many finishes have been selected.
  const spread = Math.max(evidence >= 0.5 ? 0.11 : 0.18, Math.sqrt(variance) / pace)
  return { pace, evidence, spread }
}

function isNight(date: Date, race: Partial<Race>) {
  if (!race.start_datetime) return false
  const hour = race.timezone
    ? Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: race.timezone }).format(date))
    : date.getHours()
  return hour >= 20 || hour < 6
}

export function predictPace(input: PaceModelInput): PacePrediction {
  const samples = input.courseProfile.filter((sample, index, all) => index === 0 || sample.distance > all[index - 1].distance)
  const fallback = Math.max(3, input.baselineFlatPace ?? 15)
  const calibration = historyBaseline(input.history ?? [], fallback, input.now ?? new Date(), input.totalDistance)
  // Use the same ascent normalization on both sides of the calibration.
  // Minetti still distributes effort between segments; it must not add a
  // second, incompatible aggregate climbing penalty to history-based pace.
  let gainFt = 0
  let gradeDistance = 0
  for (let i = 1; i < samples.length; i++) {
    const distance = samples[i].distance - samples[i - 1].distance
    const rise = samples[i].elevation - samples[i - 1].elevation
    gainFt += Math.max(0, rise)
    gradeDistance += distance * gradeFactor(rise / (distance * 5280))
  }
  const sampledDistance = samples.length > 1 ? samples[samples.length - 1].distance - samples[0].distance : 0
  const gradeScale = calibration.evidence > 0 && gradeDistance > 0
    ? (sampledDistance + gainFt / 528) / gradeDistance
    : 1
  const start = input.race.start_datetime ? new Date(input.race.start_datetime) : undefined
  let elapsed = 0
  const factors: PaceFactorAttribution[] = []

  for (let i = 0; i < samples.length - 1; i++) {
    const here = samples[i]
    const next = samples[i + 1]
    const distance = next.distance - here.distance
    const gradient = (next.elevation - here.elevation) / (distance * 5280)
    const terrain = terrainAt(here.distance, input.terrainNodes)
    const terrainFactor = Math.max(0.85, (terrain?.difficulty ?? 100) / 100)
    let conditions = 1
    const at = start ? new Date(start.getTime() + elapsed * 60000) : undefined
    const night = at ? isNight(at, input.race) : false
    if (night) conditions += 0.08 + (terrainFactor - 1) * 0.2
    if (here.elevation > 5000) conditions += Math.min(0.12, (here.elevation - 5000) / 100000)
    if (input.race.avg_temp_high && at) {
      const temp = Number(input.race.avg_temp_high)
      if (temp > 75) conditions += Math.min(0.1, (temp - 75) / 200)
    }
    // Technical downhill running loses the theoretical benefit of steep descents.
    if (gradient < -0.06 && terrainFactor > 1.1) conditions += Math.min(0.12, Math.abs(gradient) * (terrainFactor - 1) * 0.8)
    const profile = input.runnerProfile
    if (profile?.technical === 'weak' && terrainFactor > 1.1) conditions += 0.035
    if (profile?.technical === 'strong' && terrainFactor > 1.1) conditions -= 0.025
    if (profile?.altitude === 'weak' && here.elevation > 5000) conditions += 0.025
    if (profile?.altitude === 'strong' && here.elevation > 5000) conditions -= 0.02
    const grade = gradeFactor(gradient) * gradeScale
    const total = grade * terrainFactor * conditions
    const segmentMinutes = calibration.pace * distance * total
    elapsed += segmentMinutes
    factors.push({ mile: here.distance, distance, grade, terrain: terrainFactor, conditions, total })
  }

  const stopped = input.waypoints.reduce((sum, wp) => {
    if (!supportsDelay(wp)) return sum
    return sum + (wp.delay ?? input.aidStationDefaultDelay ?? input.runnerProfile?.aidStationDefaultDelay ?? 2)
  }, 0)
  const total = elapsed + stopped
  const relativeSpread = calibration.spread
  const confidence: PacePrediction['confidence'] = calibration.evidence >= 0.5 ? 'medium' : 'low'
  return {
    modelVersion: PACE_MODEL_VERSION,
    p10TotalMinutes: Math.max(0, total * (1 - relativeSpread)),
    p50TotalMinutes: total,
    p90TotalMinutes: total * (1 + relativeSpread),
    p50MovingMinutes: elapsed,
    p50StoppedMinutes: stopped,
    confidence,
    calibratedFlatPace: calibration.pace,
    factorAttributions: factors,
  }
}
