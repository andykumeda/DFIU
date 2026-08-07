import { SignupForm } from '../features/auth/SignupForm'
import { SiteFooter } from '@/components/ui/SiteFooter'

export default function SignupPage() {
  return (
    <div className='min-h-screen bg-neutral-950 flex flex-col'>
      <div className='flex-1 flex items-center justify-center p-4'>
        <div className='w-full max-w-md'>
          <SignupForm />
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
