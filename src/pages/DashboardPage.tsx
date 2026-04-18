import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { RaceList } from '@/features/race/RaceList'
import { Settings } from 'lucide-react'

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className='min-h-screen bg-neutral-950'>
      <header className='border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-[100]'>
        <div className='max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-1.5 sm:py-4 flex justify-between items-center gap-2'>
          <Link
            to="/dashboard"
            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity cursor-pointer relative z-[999] group min-w-0"
          >
            <img src="/logo.png" alt="DFIU Logo" className="h-10 sm:h-24 w-auto object-contain drop-shadow-lg relative z-10 shrink-0" />
            <div className="flex flex-col justify-center items-start relative z-0">
              <span className='text-3xl sm:text-7xl font-black italic tracking-tighter uppercase bg-gradient-to-br from-orange-400 to-orange-600 bg-clip-text text-transparent drop-shadow-sm pr-1 sm:pr-2 leading-[0.8]'>
                DFIU
              </span>
              <span className="hidden sm:inline text-neutral-500 text-xs font-bold tracking-[0.2em] uppercase opacity-60 -ml-1">Don't F* It Up!</span>
            </div>
          </Link>
          <div className='flex items-center gap-2 sm:gap-4'>
            <div className="flex items-center gap-3">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="w-8 h-8 rounded-full border border-neutral-700 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-400">
                  {(profile?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
                </div>
              )}
              <span className='text-neutral-400 text-sm hidden sm:block'>
                {profile?.name || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email}
              </span>
            </div>
            <Link
              to="/settings"
              className='text-neutral-400 hover:text-white p-1.5 sm:p-2 rounded-md hover:bg-neutral-800 transition-colors'
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={handleSignOut}
              className='text-neutral-400 hover:text-white text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 sm:py-1.5 rounded-md hover:bg-neutral-800 transition-colors whitespace-nowrap'
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='flex justify-between items-center mb-8'>
          <h2 className='text-2xl font-bold text-white'>Your Races</h2>
          <Link
            to='/race/new'
            className='bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors text-sm flex items-center gap-2'
          >
            <span>+</span> New Race
          </Link>
        </div>

        <RaceList />
      </main>
    </div>
  )
}
