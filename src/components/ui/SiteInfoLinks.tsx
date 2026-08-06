import { BookOpen, Info } from 'lucide-react'
import { Link } from 'react-router-dom'

interface SiteInfoLinksProps {
  className?: string
}

export function SiteInfoLinks({ className = '' }: SiteInfoLinksProps) {
  return (
    <nav aria-label='Site information' className={`flex items-center gap-1 ${className}`}>
      <Link to='/about' className='inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors text-xs sm:text-sm'>
        <Info size={15} aria-hidden='true' /> About
      </Link>
      <Link to='/documentation' className='inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors text-xs sm:text-sm'>
        <BookOpen size={15} aria-hidden='true' /> Docs
      </Link>
    </nav>
  )
}
