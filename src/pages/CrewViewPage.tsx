import { Suspense, lazy } from 'react'
import { useParams } from 'react-router-dom'

const CrewView = lazy(() =>
    import('@/features/race/CrewView').then(m => ({ default: m.CrewView }))
)

export default function CrewViewPage() {
    const { id } = useParams<{ id: string }>()
    if (!id) return <div className='p-6 text-white'>Invalid race ID</div>
    return (
        <Suspense fallback={<div className='p-6 text-white text-center'>Loading…</div>}>
            <CrewView raceId={id} />
        </Suspense>
    )
}
