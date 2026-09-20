import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { RACE_SELECT } from '@/lib/race-select'
import type { Course, Race, TerrainNode, TrainingRoute, Waypoint } from '@/types/database'
import { buildOfficialUpdateSections } from './official-update-diff'

export function useOfficialUpdateReview(
  race: Race | undefined,
  course: Course | null | undefined,
  waypoints: Waypoint[],
  terrain: TerrainNode[],
  enabled: boolean,
  sourceRevision?: number | null,
) {
  const sourceQuery = useQuery({
    queryKey: ['official-update-review', race?.id, sourceRevision],
    enabled: enabled && !!race?.official_source_race_id,
    queryFn: async () => {
      const sourceId = race!.official_source_race_id!
      const { data: sourceRace, error: raceError } = await supabase.from('races').select(RACE_SELECT).eq('id', sourceId).single()
      if (raceError) throw raceError
      const { data: sourceCourse, error: courseError } = await supabase.from('courses').select('*').eq('race_id', sourceId).maybeSingle()
      if (courseError) throw courseError
      const [sourceTrainingResult, currentTrainingResult] = await Promise.all([
        supabase.from('training_routes').select('*').eq('race_id', sourceId).order('sort_order'),
        supabase.from('training_routes').select('*').eq('race_id', race!.id).order('sort_order'),
      ])
      if (sourceTrainingResult.error) throw sourceTrainingResult.error
      if (currentTrainingResult.error) throw currentTrainingResult.error
      let sourceWaypoints: Waypoint[] = []
      let sourceTerrain: TerrainNode[] = []
      if (sourceCourse) {
        const [waypointResult, terrainResult] = await Promise.all([
          supabase.from('waypoints').select('*').eq('course_id', sourceCourse.id).order('mile'),
          supabase.from('terrain_nodes').select('*').eq('course_id', sourceCourse.id).order('mile'),
        ])
        if (waypointResult.error) throw waypointResult.error
        if (terrainResult.error) throw terrainResult.error
        sourceWaypoints = (waypointResult.data ?? []) as Waypoint[]
        sourceTerrain = (terrainResult.data ?? []) as TerrainNode[]
      }
      return {
        official: {
          race: sourceRace as unknown as Race,
          course: sourceCourse as Course | null,
          waypoints: sourceWaypoints,
          terrain: sourceTerrain,
          trainingRoutes: (sourceTrainingResult.data ?? []) as TrainingRoute[],
        },
        currentTrainingRoutes: (currentTrainingResult.data ?? []) as TrainingRoute[],
      }
    },
  })

  const sections = useMemo(() => sourceQuery.data && race
    ? buildOfficialUpdateSections(
      { race, course: course ?? null, waypoints, terrain, trainingRoutes: sourceQuery.data.currentTrainingRoutes },
      sourceQuery.data.official,
    )
    : [], [sourceQuery.data, race, course, waypoints, terrain])

  return { ...sourceQuery, data: sections }
}
