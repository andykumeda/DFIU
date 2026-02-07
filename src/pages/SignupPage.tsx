import { SignupForm } from '../features/auth/SignupForm'

export default function SignupPage() {
  return (
    <div className='min-h-screen bg-neutral-950 flex items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        <SignupForm />
      </div>
    </div>
  )
}
