import { LogIn, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { SiteFooter } from './SiteFooter'

interface PublicPageLayoutProps {
  eyebrow: string
  title: string
  intro: string
  children: React.ReactNode
}

export function PublicPageLayout({ eyebrow, title, intro, children }: PublicPageLayoutProps) {
  const { user } = useAuth()

  return (
    <div className='min-h-screen bg-neutral-950 text-white'>
      <header className='border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-10'>
        <div className='max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4'>
          <Link to='/' className='flex items-center gap-2 shrink-0' aria-label='DFIU home'>
            <img src='/logo.png' alt='DFIU' className='h-10 w-auto object-contain' />
            <span className='hidden sm:inline text-xl font-black italic tracking-tight text-orange-400'>DFIU</span>
          </Link>

          <nav aria-label='Information' className='flex items-center gap-1 sm:gap-2 text-sm'>
            {user ? (
              <Link to='/dashboard' className='ml-1 px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 font-semibold transition-colors'>Dashboard</Link>
            ) : (
              <>
                <Link to='/login' className='ml-1 px-2.5 py-2 rounded-md text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5'>
                  <LogIn size={15} aria-hidden='true' /> Sign in
                </Link>
                <Link to='/signup' className='px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 font-semibold transition-colors inline-flex items-center gap-1.5'>
                  <UserPlus size={15} aria-hidden='true' /> Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className='max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16'>
        <div className='max-w-3xl'>
          <p className='text-sm font-semibold uppercase tracking-[0.18em] text-orange-400'>{eyebrow}</p>
          <h1 className='mt-3 text-4xl sm:text-5xl font-black tracking-tight'>{title}</h1>
          <p className='mt-5 text-lg leading-8 text-neutral-400'>{intro}</p>
        </div>
        <div className='mt-10'>{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}
