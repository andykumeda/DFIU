import { useParams } from 'react-router-dom'
import { RaceDetail } from '@/features/race/RaceDetail'

export default function RaceDetailPage() {
  const { id } = useParams<{ id: string }>()

  if (!id) return <div>Invalid Race ID</div>

  return <RaceDetail raceId={id} />
}
