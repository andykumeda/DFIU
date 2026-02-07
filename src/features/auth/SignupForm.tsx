import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <form onSubmit={handleSubmit} className='bg-neutral-900 border border-neutral-800 p-8 rounded-xl w-full max-w-md'>
      <h1 className='text-2xl font-bold text-white mb-2'>Create Account</h1>
      <p className='text-neutral-400 mb-6'>Start planning your next ultra</p>

      {error && (
        <div className='bg-red-900/20 border border-red-900/50 text-red-200 p-3 rounded-lg mb-6 text-sm'>
          {error}
        </div>
      )}

      <div className='space-y-4'>
        <div>
          <label htmlFor='email' className='block text-sm font-medium text-neutral-300 mb-1'>Email</label>
          <input
            id='email'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder='you@example.com'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <div>
          <label htmlFor='password' className='block text-sm font-medium text-neutral-300 mb-1'>Password</label>
          <input
            id='password'
            type='password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder='••••••••'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <div>
          <label htmlFor='confirmPassword' className='block text-sm font-medium text-neutral-300 mb-1'>Confirm Password</label>
          <input
            id='confirmPassword'
            type='password'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder='••••••••'
            className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors'
          />
        </div>

        <button
          type='submit'
          disabled={loading}
          className='w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </div>

      <p className='mt-6 text-center text-sm text-neutral-400'>
        Already have an account? <Link to='/login' className='text-blue-500 hover:text-blue-400 font-medium'>Sign in</Link>
      </p>
    </form>
  )
}
