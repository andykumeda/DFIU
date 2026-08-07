import { LoginForm } from '../features/auth/LoginForm'
import { SiteFooter } from '@/components/ui/SiteFooter'

export default function LoginPage() {
  return (
    <div className='min-h-screen bg-neutral-950 flex flex-col'>
      <div className='flex-1 flex items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        <LoginForm />
      </div>
      </div>
      <SiteFooter />
    </div>
  )
}
