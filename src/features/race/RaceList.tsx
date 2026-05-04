import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import type { Race } from '@/types/database'
import { formatDate } from '@/lib/utils'

export function RaceList() {
  const { user } = useAuth()
  const { data: races, isLoading, error } = useQuery({
    queryKey: ['races', user?.id ?? 'anon'],
    queryFn: async () => {
      const filter = user
        ? `user_id.eq.${user.id},is_public.eq.true`
        : `is_public.eq.true`
      const { data, error } = await supabase
        .from('races')
        .select('*')
        .or(filter)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Race[]
    }
  })

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
    return (
      <div className='flex flex-col items-center justify-center p-16 bg-neutral-900 rounded-xl border border-neutral-800 border-dashed text-center'>
        <div className='text-4xl mb-4'>🏃</div>
        <h3 className='text-xl font-semibold text-white mb-2'>No races yet</h3>
        <p className='text-neutral-400 mb-6'>Create your first race to get started with planning your ultra.</p>
        <Link 
          to='/race/new' 
          className='bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors'
        >
          Create Your First Race
        </Link>
      </div>
    )
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
      {races.map((race) => (
        <Link 
          key={race.id} 
          to={`/race/${race.id}`} 
          className='bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-blue-600 transition-colors group block'
        >
          <h3 className='text-lg font-semibold text-white mb-2 group-hover:text-blue-500 transition-colors'>
            {race.name}
          </h3>
          {race.location && (
            <p className='text-neutral-400 text-sm mb-4'>{race.location}</p>
          )}
          <div className='flex items-center gap-3'>
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
          </div>
        </Link>
      ))}
    </div>
  )
}
