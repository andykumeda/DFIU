import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'

// Lands here after Supabase invite email redirect. Supabase JS auto-exchanges
// the token in the URL hash (detectSessionInUrl is on by default), so by the
// time AuthContext sees a user we can let them set a password.
export default function SetPasswordPage() {
  const navigate = useNavigate()
  const { user, loading, refreshMemberships } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Pull newly-claimed memberships (inserted by handle_new_user trigger)
  // into client state on first arrival from invite link.
  useEffect(() => {
    if (user) {
      refreshMemberships?.()
    }
  }, [user, refreshMemberships])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setSuccess(true)
    setTimeout(() => navigate('/dashboard'), 800)
  }

  if (loading) {
    return (
      <div className='min-h-screen bg-neutral-950 text-white flex items-center justify-center'>
        <div className='text-xl font-bold'>Checking invite...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className='min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4'>
        <div className='w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-xl'>
          <h1 className='text-2xl font-bold mb-2'>Invite link invalid or expired</h1>
          <p className='text-neutral-400 mb-6'>
            The link may have expired or already been used. Ask the person who invited you to send another.
          </p>
          <button
            onClick={() => navigate('/login')}
            className='w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg'
          >
            Go to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-neutral-950 flex items-center justify-center p-4'>
      <form onSubmit={handleSubmit} className='bg-neutral-900 border border-neutral-800 p-8 rounded-xl w-full max-w-md'>
        <h1 className='text-2xl font-bold text-white mb-2'>Set your password</h1>
        <p className='text-neutral-400 mb-6'>
          Welcome to DFIU. Pick a password so you can sign back in later.
        </p>

        {error && (
          <div className='bg-red-900/20 border border-red-900/50 text-red-200 p-3 rounded-lg mb-6 text-sm'>
            {error}
          </div>
        )}
        {success && (
          <div className='bg-emerald-900/20 border border-emerald-900/50 text-emerald-200 p-3 rounded-lg mb-6 text-sm'>
            Password set. Redirecting...
          </div>
        )}

        <div className='space-y-4'>
          <div>
            <label htmlFor='password' className='block text-sm font-medium text-neutral-300 mb-1'>Password</label>
            <input
              id='password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder='••••••••'
              className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500'
            />
          </div>
          <div>
            <label htmlFor='confirm' className='block text-sm font-medium text-neutral-300 mb-1'>Confirm password</label>
            <input
              id='confirm'
              type='password'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder='••••••••'
              className='w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500'
            />
          </div>
          <button
            type='submit'
            disabled={submitting || success}
            className='w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg'
          >
            {submitting ? 'Saving...' : 'Set password'}
          </button>
        </div>
      </form>
    </div>
  )
}
