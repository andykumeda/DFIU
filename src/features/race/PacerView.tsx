import { Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle, Footprints } from 'lucide-react'
import { usePermission } from '@/features/auth/usePermission'
import { SiteFooter } from '@/components/ui/SiteFooter'

interface PacerViewProps {
  raceId: string
}

export function PacerView({ raceId }: PacerViewProps) {
  const { canView } = usePermission(raceId)
  if (!canView) {
    return (
      <div className='min-h-screen bg-neutral-950 text-white p-6 text-center'>
        <AlertCircle className='w-8 h-8 mx-auto mb-2 text-amber-400' />
        You don't have access to this race.
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-neutral-950 text-white'>
      <header className='sticky top-0 z-30 bg-neutral-900/95 backdrop-blur border-b border-neutral-800'>
        <div className='flex items-center gap-3 px-3 py-2'>
          <Link to={`/race/${raceId}`} className='p-2 -ml-2 rounded hover:bg-neutral-800'>
            <ArrowLeft className='w-5 h-5' />
          </Link>
          <div className='min-w-0 flex-1'>
            <div className='text-xs text-neutral-400 truncate'>Pacer View</div>
            <div className='text-sm font-semibold truncate'>Race execution</div>
          </div>
        </div>
      </header>

      <main className='max-w-xl mx-auto p-4'>
        <section className='bg-neutral-900 border border-neutral-800 rounded-lg p-4'>
          <div className='flex items-center gap-2 mb-2'>
            <Footprints className='w-5 h-5 text-blue-400' />
            <h1 className='text-lg font-semibold'>Pacer View</h1>
          </div>
          <p className='text-sm text-neutral-400'>
            Pacer-specific race-day tools will live here. For now, use the full race view or Crew View for ETAs, aid-station details, and arrival logging.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
