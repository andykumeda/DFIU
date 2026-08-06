import { Link } from 'react-router-dom'
import { RaceList } from '@/features/race/RaceList'
import { useAuth } from '@/features/auth/AuthContext'
import { SiteFooter } from '@/components/ui/SiteFooter'

export default function EventsPage() {
  const { user } = useAuth()

  return (
    <div className='min-h-screen bg-neutral-950 text-white'>
      <header className='border-b border-neutral-800 bg-neutral-950/70 backdrop-blur-sm sticky top-0 z-[100]'>
        <div className='max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-4 flex justify-between items-center gap-3'>
          <Link
            to='/events'
            className='flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity min-w-0'
          >
            <img src='/logo.png' alt='DFIU Logo' className='h-10 sm:h-16 w-auto object-contain drop-shadow-lg shrink-0' />
            <div className='hidden sm:flex flex-col justify-center items-start'>
              <span className='text-4xl font-black italic tracking-tighter uppercase bg-gradient-to-br from-orange-400 to-orange-600 bg-clip-text text-transparent drop-shadow-sm pr-2 leading-[0.8]'>
                DFIU
              </span>
              <span className='text-neutral-500 text-[10px] font-bold tracking-[0.18em] uppercase opacity-70 -ml-0.5'>
                Public Events
              </span>
            </div>
          </Link>
          <div className='flex items-center gap-2'>
            {user ? (
              <Link
                to='/dashboard'
                className='text-neutral-300 hover:text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-neutral-800 transition-colors'
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to='/login'
                  className='text-neutral-300 hover:text-white text-sm font-medium px-3 py-2 rounded-md hover:bg-neutral-800 transition-colors'
                >
                  Sign In
                </Link>
                <Link
                  to='/signup'
                  className='bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors'
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10'>
        {user && (
          <section className='space-y-6'>
            <div className='flex items-center justify-between gap-4'>
              <div>
                <h1 className='text-3xl font-bold'>Your Events</h1>
                <p className='mt-2 text-neutral-400 max-w-2xl'>
                  Races you own or have been invited to help manage.
                </p>
              </div>
              <Link
                to='/race/new'
                className='bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold transition-colors text-sm whitespace-nowrap'
              >
                New Race
              </Link>
            </div>
            <RaceList mode='user' />
          </section>
        )}

        <section className='space-y-6'>
          <div>
            <h2 className={user ? 'text-2xl font-bold' : 'text-3xl font-bold'}>Public Events</h2>
            <p className='mt-2 text-neutral-400 max-w-2xl'>
              Search public race plans by event, location, or date. Official events are marked with a blue check.
            </p>
          </div>
          <RaceList mode='public' />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
