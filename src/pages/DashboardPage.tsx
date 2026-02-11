import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { supabase } from '@/lib/supabase'
import { RaceList } from '@/features/race/RaceList'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className='min-h-screen bg-neutral-950'>
      <header className='border-b border-neutral-800 bg-neutral-950/50 backdrop-blur-sm sticky top-0 z-10'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center'>
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
              <img src="/logo.png" alt="DFIU Logo" className="h-12 w-12 object-contain" />
            </div>
            <span className='text-3xl font-black bg-gradient-to-br from-blue-500 to-cyan-400 bg-clip-text text-transparent'>
              DFIU
            </span>
          </Link>
          <div className='flex items-center gap-4'>
            <span className='text-neutral-400 text-sm hidden sm:block'>{user?.email}</span>
            <button
              onClick={handleSignOut}
              className='text-neutral-400 hover:text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-neutral-800 transition-colors'
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
