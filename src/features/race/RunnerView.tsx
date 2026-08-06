import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Radio, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { RACE_SELECT } from '@/lib/race-select'
import { useAuth } from '@/features/auth/AuthContext'
import { usePermission } from '@/features/auth/usePermission'
import { useRunnerLocationUploader } from './useRunnerLocation'
import type { Race } from '@/types/database'
import { SiteFooter } from '@/components/ui/SiteFooter'

interface RunnerViewProps {
  raceId: string
}

export function RunnerView({ raceId }: RunnerViewProps) {
  const { profile } = useAuth() as { profile: { clock_24h?: boolean } | null }
  const clock24h = !!profile?.clock_24h
  const { canView, isRunner } = usePermission(raceId)
  const [race, setRace] = useState<Race | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('races').select(RACE_SELECT).eq('id', raceId).single()
      if (!cancelled) {
        setRace((data as unknown as Race | null) ?? null)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [raceId])

  const uploader = useRunnerLocationUploader(raceId, race)

  if (!canView && !loading) {
    return (
      <div className='min-h-screen bg-neutral-950 text-white p-6 text-center'>
        <AlertCircle className='w-8 h-8 mx-auto mb-2 text-amber-400' />
        You don't have access to this race.
      </div>
    )
  }

  if (loading || !race) return <div className='min-h-screen bg-neutral-950 text-white p-6 text-center'>Loading...</div>

  return (
    <div className='min-h-screen bg-neutral-950 text-white'>
      <header className='sticky top-0 z-30 bg-neutral-900/95 backdrop-blur border-b border-neutral-800'>
        <div className='flex items-center gap-3 px-3 py-2'>
          <Link to={`/race/${raceId}`} className='p-2 -ml-2 rounded hover:bg-neutral-800'>
            <ArrowLeft className='w-5 h-5' />
          </Link>
          <div className='min-w-0 flex-1'>
            <div className='text-xs text-neutral-400 truncate'>Runner View</div>
            <div className='text-sm font-semibold truncate'>{race.name}</div>
          </div>
        </div>
      </header>

      <main className='max-w-xl mx-auto p-4 space-y-4'>
        <section className='bg-neutral-900 rounded-lg p-4 border border-neutral-800'>
          <div className='flex items-center gap-2 mb-3'>
            <Radio className={uploader.status === 'active' ? 'w-5 h-5 text-emerald-400' : 'w-5 h-5 text-neutral-500'} />
            <h1 className='text-lg font-semibold'>Location sharing</h1>
          </div>
          <div className='text-sm text-neutral-300'>{uploader.message}</div>
          <div className='mt-3 grid grid-cols-2 gap-2 text-sm'>
            <div className='bg-neutral-800 rounded p-3'>
              <div className='text-xs text-neutral-400'>Race window</div>
              <div className={uploader.raceWindowActive ? 'font-semibold text-emerald-300' : 'font-semibold text-neutral-300'}>
                {uploader.raceWindowActive ? 'Active' : 'Inactive'}
              </div>
            </div>
            <div className='bg-neutral-800 rounded p-3'>
              <div className='text-xs text-neutral-400'>Last upload</div>
              <div className='font-semibold text-neutral-300'>
                {uploader.lastUploadAt ? uploader.lastUploadAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !clock24h }) : '—'}
              </div>
            </div>
          </div>
          {!isRunner && (
            <div className='mt-3 text-sm text-amber-300 bg-amber-950/40 border border-amber-900/60 rounded p-2'>
              Runner role is required before this phone can share the runner location.
            </div>
          )}
        </section>

        <section className='bg-neutral-900 rounded-lg p-4 border border-neutral-800'>
          <div className='flex items-center gap-2 mb-2'>
            <MapPin className='w-5 h-5 text-blue-400' />
            <h2 className='text-base font-semibold'>During the race</h2>
          </div>
          <p className='text-sm text-neutral-400'>
            Keep this page open during the event. Location uploads run automatically every 60 seconds during the race window when browser location permission is available.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
