import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { RACE_SELECT } from '@/lib/race-select'
import { useAuth } from '@/features/auth/AuthContext'
import type { Race } from '@/types/database'
import { formatDate } from '@/lib/utils'
import { CheckCircle2, Search } from 'lucide-react'

interface RaceListProps {
  mode?: 'user' | 'public'
  showSearch?: boolean
}

export function RaceList({ mode = 'user', showSearch = mode === 'public' }: RaceListProps) {
  const { user, memberships } = useAuth()
  const [search, setSearch] = useState('')
  const membershipRaceIds = useMemo(
    () => Object.keys(memberships).sort(),
    [memberships]
  )
  const { data: races, isLoading, error } = useQuery({
    queryKey: ['races', mode, user?.id ?? 'anon', membershipRaceIds],
    queryFn: async () => {
      if (mode === 'public') {
        const { data, error } = await supabase
          .from('races')
          .select(RACE_SELECT)
          .eq('is_public', true)
          .order('start_datetime', { ascending: true })

        if (error) throw error
        return data as unknown as Race[]
      }

      if (!user) return []

      const raceMap = new Map<string, Race>()

      if (membershipRaceIds.length > 0) {
        const { data, error } = await supabase
          .from('races')
          .select(RACE_SELECT)
          .in('id', membershipRaceIds)
          .order('created_at', { ascending: false })

        if (error) throw error
        for (const race of (data as unknown as Race[] | null) ?? []) {
          raceMap.set(race.id, race)
        }
      }

      const { data: ownedRaces, error: ownedError } = await supabase
        .from('races')
        .select(RACE_SELECT)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (ownedError) throw ownedError
      for (const race of (ownedRaces as unknown as Race[] | null) ?? []) {
        raceMap.set(race.id, race)
      }

      return Array.from(raceMap.values()).sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
    }
  })

  const visibleRaces = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!races || !q) return races ?? []

    return races.filter(race => {
      const dateText = [
        formatDate(race.start_datetime, 'PPP'),
        formatDate(race.start_datetime, 'yyyy-MM-dd'),
        race.start_datetime ? new Date(race.start_datetime).getFullYear().toString() : '',
      ].join(' ')
      return [
        race.name,
        race.location,
        dateText,
      ].some(value => (value ?? '').toLowerCase().includes(q))
    })
  }, [races, search])

  if (isLoading) {
    return (
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {[1, 2, 3].map((i) => (
          <div key={i} className='h-48 bg-neutral-900 rounded-xl animate-pulse border border-neutral-800' />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className='p-8 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-center'>
        <h3 className='font-bold mb-2'>Failed to load races</h3>
        <p className='text-sm'>{error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    )
  }

  if (!races || races.length === 0) {
    if (mode === 'public') {
      return (
        <div className='flex flex-col items-center justify-center p-16 bg-neutral-900 rounded-xl border border-neutral-800 border-dashed text-center'>
          <div className='text-4xl mb-4'>🏁</div>
          <h3 className='text-xl font-semibold text-white mb-2'>No public events yet</h3>
          <p className='text-neutral-400'>Public and official events will show up here once owners publish them.</p>
        </div>
      )
    }

    return (
      <div className='flex flex-col items-center justify-center p-16 bg-neutral-900 rounded-xl border border-neutral-800 border-dashed text-center'>
        <div className='text-4xl mb-4'>🏃</div>
        <h3 className='text-xl font-semibold text-white mb-2'>No events yet</h3>
        <p className='text-neutral-400 mb-6'>Create your first race or clone a public event to start planning.</p>
        <Link 
          to='/race/new' 
          className='bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors'
        >
          Create Your First Event
        </Link>
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {showSearch && (
        <div className='relative max-w-2xl'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500' />
          <input
            type='search'
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search by event, location, or date'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-3 py-3 text-sm text-white placeholder-neutral-500 focus:ring-2 focus:ring-blue-500 outline-none'
          />
        </div>
      )}

      {visibleRaces.length === 0 ? (
        <div className='p-10 bg-neutral-900 rounded-xl border border-neutral-800 border-dashed text-center text-neutral-400'>
          No events match your search.
        </div>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {visibleRaces.map((race) => (
            <div
              key={race.id}
              className='bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-blue-600 transition-colors group'
            >
              <Link to={`/race/${race.id}`} className='block'>
                <div className='flex items-start gap-2 mb-2'>
                  <h3 className='text-lg font-semibold text-white group-hover:text-blue-500 transition-colors min-w-0 flex-1'>
                    {race.name}
                  </h3>
                  {race.is_official && (
                    <CheckCircle2 className='w-5 h-5 text-blue-400 shrink-0' aria-label='Official event' />
                  )}
                </div>
                {race.location && (
                  <p className='text-neutral-400 text-sm mb-4'>{race.location}</p>
                )}
                <div className='flex items-center gap-3 flex-wrap'>
                  {race.distance_miles && (
                    <span className='bg-blue-900/20 text-blue-500 px-3 py-1 rounded-full text-xs font-medium'>
                      {race.distance_miles} miles
                    </span>
                  )}
                  {race.start_datetime && (
                    <span className='text-neutral-500 text-xs'>
                      {formatDate(race.start_datetime, 'PPP')}
                    </span>
                  )}
                  {race.is_public && (
                    <span className='text-neutral-500 text-xs'>
                      Public
                    </span>
                  )}
                </div>
              </Link>
              {mode === 'public' && !user && (
                <Link
                  to={`/race/${race.id}?demo=1`}
                  className='mt-4 inline-flex text-sm font-semibold text-blue-400 hover:text-blue-300'
                >
                  Try without account
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
