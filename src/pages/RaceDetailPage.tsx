import { DemoModeProvider } from '@/features/demo/DemoModeProvider'
import { RaceDetail } from '@/features/race/RaceDetail'
import { useParams } from 'react-router-dom'

export default function RaceDetailPage() {
  const { id } = useParams<{ id: string }>()

  if (!id) return <div>Invalid Race ID</div>

  return (
    <DemoModeProvider raceId={id}>
      <RaceDetail raceId={id} />
    </DemoModeProvider>
  )
}
