import { Suspense, lazy } from 'react'
import { useParams } from 'react-router-dom'

const RunnerView = lazy(() =>
  import('@/features/race/RunnerView').then(m => ({ default: m.RunnerView }))
)

export default function RunnerViewPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <div className='p-6 text-white'>Invalid race ID</div>
  return (
    <Suspense fallback={<div className='p-6 text-white text-center'>Loading...</div>}>
      <RunnerView raceId={id} />
    </Suspense>
  )
}
