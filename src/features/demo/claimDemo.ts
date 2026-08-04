import { supabase } from '@/lib/supabase'
import type { Race, Waypoint, TerrainNode } from '@/types/database'
import {
  clearClaimDemoIntent,
  clearDemoOverlay,
  loadDemoOverlay,
  peekClaimDemoIntent,
  type DemoOverlay,
} from './demoStore'
import type { PacePlans } from '@/features/race/usePacePlans'

export type ClaimDemoResult =
  | { ok: true; raceId: string }
  | { ok: false; reason: string }

async function applyOverlayToClone(cloneRaceId: string, overlay: DemoOverlay): Promise<void> {
  if (overlay.race) {
    const {
      id: _id,
      user_id: _userId,
      is_public: _isPublic,
      is_official: _isOfficial,
      official_at: _officialAt,
      official_source_race_id: _source,
      race_director_user_id: _rd,
      public_share_enabled: _shareEnabled,
      public_share_token: _shareToken,
      created_at: _created,
      official_revision: _rev,
      merged_official_revision: _merged,
      ...racePatch
    } = overlay.race as Partial<Race> & Record<string, unknown>

    if (Object.keys(racePatch).length > 0) {
      const { error } = await (supabase.from('races') as any).update(racePatch).eq('id', cloneRaceId)
      if (error) throw error
    }
  }

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('race_id', cloneRaceId)
    .maybeSingle()
  if (courseError) throw courseError
  if (!course?.id) return

  if (overlay.waypoints) {
    const { error: delWp } = await supabase.from('waypoints').delete().eq('course_id', course.id)
    if (delWp) throw delWp

    if (overlay.waypoints.length > 0) {
      const rows = overlay.waypoints.map((wp: Waypoint, index: number) => ({
        course_id: course.id,
        official_source_waypoint_id: wp.official_source_waypoint_id ?? (wp.id || null),
        lat: wp.lat,
        lon: wp.lon,
        name: wp.name,
        elevation_ft: wp.elevation_ft,
        type: wp.type,
        crew_allowed: wp.crew_allowed,
        pacer_allowed: wp.pacer_allowed,
        has_drop_bag: wp.has_drop_bag,
        cutoff_time: wp.cutoff_time,
        mile: wp.mile,
        notes: wp.notes,
        drop_bag_items: wp.drop_bag_items,
        drop_bag_name: wp.drop_bag_name,
        drop_bag_notes: wp.drop_bag_notes,
        crew_relay_notes: wp.crew_relay_notes,
        runner_next_leg_notes: wp.runner_next_leg_notes,
        delay: wp.delay,
        order_index: wp.order_index ?? index,
      }))
      const { error: insWp } = await (supabase.from('waypoints') as any).insert(rows)
      if (insWp) throw insWp
    }
  }

  if (overlay.terrainNodes) {
    const { error: delTn } = await supabase.from('terrain_nodes').delete().eq('course_id', course.id)
    if (delTn) throw delTn

    if (overlay.terrainNodes.length > 0) {
      const rows = overlay.terrainNodes.map((node: TerrainNode) => ({
        course_id: course.id,
        official_source_terrain_node_id: node.official_source_terrain_node_id ?? (node.id || null),
        lat: node.lat,
        lon: node.lon,
        mile: node.mile,
        type: node.type,
        difficulty: node.difficulty,
      }))
      const { error: insTn } = await (supabase.from('terrain_nodes') as any).insert(rows)
      if (insTn) throw insTn
    }
  }

  if (overlay.pacePlans) {
    const plans = overlay.pacePlans as PacePlans
    const { error: paceErr } = await (supabase.from('race_pace_plans') as any).upsert({
      race_id: cloneRaceId,
      plan_a_time: plans.planATimeStr,
      plan_b_time: plans.planBTimeStr === '' ? null : plans.planBTimeStr,
      plan_c_buffer: plans.planCBufferStr,
      has_calculated: plans.hasCalculated,
      pace_chart_columns: plans.paceChartColumns,
      pace_model_snapshot: plans.paceModelSnapshot,
      updated_at: new Date().toISOString(),
    })
    if (paceErr) throw paceErr
  }
}

/**
 * If the signed-in user has a pending demo claim, clone the source race,
 * apply the IndexedDB overlay, and clear local demo state.
 */
export async function claimPendingDemoIfAny(options?: {
  sourceRaceId?: string | null
}): Promise<ClaimDemoResult | null> {
  const sourceRaceId = options?.sourceRaceId ?? peekClaimDemoIntent()
  if (!sourceRaceId) return null

  const overlay = await loadDemoOverlay(sourceRaceId)

  const { data: newRaceId, error } = await supabase.rpc('clone_race', { p_race_id: sourceRaceId })
  if (error || !newRaceId) {
    return { ok: false, reason: error?.message ?? 'Failed to clone demo event' }
  }

  try {
    if (overlay) {
      await applyOverlayToClone(newRaceId, overlay)
    }
  } catch (err) {
    console.error('Failed to apply demo overlay after clone', err)
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Cloned, but failed to apply demo edits',
    }
  }

  await clearDemoOverlay(sourceRaceId)
  clearClaimDemoIntent()
  return { ok: true, raceId: newRaceId }
}
