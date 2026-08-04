import type { Race, TerrainNode, Waypoint } from '@/types/database'
import type { RunnerPacingProfile } from './runner-profile'

export const PACE_MODEL_VERSION = 'terrain-hybrid-v1'

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

function historyBaseline(history: RunnerHistoryEntry[], fallback: number, now: Date) {
  let numerator = 0
  let denominator = 0
  for (const item of history) {
    if (!Number.isFinite(item.distanceMi) || item.distanceMi <= 0 || !Number.isFinite(item.finishMinutes) || item.finishMinutes <= 0) continue
    const gainCost = 1 + Math.min(0.35, ((item.elevationGainFt ?? 0) / item.distanceMi) / 10000)
    const equivalentPace = (item.movingMinutes ?? item.finishMinutes) / item.distanceMi / gainCost
    const ageDays = item.racedAt ? Math.max(0, (now.getTime() - new Date(item.racedAt).getTime()) / 86400000) : 365
    const recency = Math.exp(-ageDays / 365)
    const distanceWeight = Math.min(1.5, Math.max(0.5, item.distanceMi / 26.2))
    const weight = recency * distanceWeight
    numerator += equivalentPace * weight
    denominator += weight
  }
  if (denominator === 0) return { pace: fallback, evidence: 0 }
  // History has a strong but bounded influence so a miscoded result cannot dominate.
  const observed = numerator / denominator
  const blend = Math.min(0.8, 0.35 + denominator * 0.2)
  return { pace: fallback * (1 - blend) + observed * blend, evidence: denominator }
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
  const calibration = historyBaseline(input.history ?? [], fallback, input.now ?? new Date())
  const start = input.race.start_datetime ? new Date(input.race.start_datetime) : undefined
  let elapsed = 0
  const factors: PaceFactorAttribution[] = []

  for (let i = 0; i < samples.length - 1; i++) {
    const here = samples[i]
    const next = samples[i + 1]
    const distance = next.distance - here.distance
    const gradient = ((next.elevation - here.elevation) * 0.3048) / (distance * 1609.34)
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
    const grade = gradeFactor(gradient)
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
  const relativeSpread = calibration.evidence >= 2 ? 0.07 : calibration.evidence > 0 ? 0.11 : 0.18
  const confidence: PacePrediction['confidence'] = calibration.evidence >= 2 ? 'high' : calibration.evidence > 0 ? 'medium' : 'low'
  return {
    modelVersion: PACE_MODEL_VERSION,
    p10TotalMinutes: total * (1 - relativeSpread),
    p50TotalMinutes: total,
    p90TotalMinutes: total * (1 + relativeSpread),
    p50MovingMinutes: elapsed,
    p50StoppedMinutes: stopped,
    confidence,
    calibratedFlatPace: calibration.pace,
    factorAttributions: factors,
  }
}
