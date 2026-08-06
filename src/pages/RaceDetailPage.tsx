import { DemoModeProvider } from '@/features/demo/DemoModeProvider'
import { RaceDetail } from '@/features/race/RaceDetail'
import { isRaceUuid } from '@/features/race/share-link'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

async function resolveRaceId(idOrAlias: string): Promise<string> {
  if (isRaceUuid(idOrAlias)) return idOrAlias

  const alias = idOrAlias.trim().toLowerCase()
  if (!alias) throw new Error('missing alias')

  const { data, error } = await supabase
    .from('races')
    .select('id')
    .eq('public_share_alias', alias)
    .maybeSingle()

  if (error) throw error
  if (!data?.id) throw new Error('not found')
  return data.id
}

export default function RaceDetailPage() {
  const { id, idOrAlias } = useParams<{ id?: string; idOrAlias?: string }>()
  const param = id ?? idOrAlias
  const uuidParam = param && isRaceUuid(param) ? param : null

  const { data: resolvedId, isError, isPending } = useQuery({
    queryKey: ['race-id-resolve', param],
    queryFn: () => resolveRaceId(param!),
    enabled: !!param && !uuidParam,
    retry: false,
  })

  const raceId = uuidParam ?? resolvedId ?? null

  if (!param || isError) {
    return <div className='p-8 text-white'>Event not found</div>
  }
  if (!raceId || (!uuidParam && isPending)) {
    return <div className='p-8 text-white'>Loading event…</div>
  }

  return (
    <DemoModeProvider raceId={raceId}>
      <RaceDetail raceId={raceId} />
    </DemoModeProvider>
  )
}
