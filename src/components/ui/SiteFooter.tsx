import { Link } from 'react-router-dom'

export function SiteFooter() {
  return (
    <footer className='print:hidden border-t border-neutral-800 bg-neutral-950/80'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm'>
        <span className='text-neutral-500'>DFIU · Don&apos;t F* It Up!</span>
        <nav aria-label='Site information' className='flex items-center gap-4'>
          <Link to='/about' className='text-neutral-400 hover:text-white transition-colors'>About</Link>
          <Link to='/documentation' className='text-neutral-400 hover:text-white transition-colors'>Documentation</Link>
        </nav>
      </div>
    </footer>
  )
}
