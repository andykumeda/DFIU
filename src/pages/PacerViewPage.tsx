import { Suspense, lazy } from 'react'
import { useParams } from 'react-router-dom'

const PacerView = lazy(() =>
  import('@/features/race/PacerView').then(m => ({ default: m.PacerView }))
)

export default function PacerViewPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <div className='p-6 text-white'>Invalid race ID</div>
  return (
    <Suspense fallback={<div className='p-6 text-white text-center'>Loading...</div>}>
      <PacerView raceId={id} />
    </Suspense>
  )
}
