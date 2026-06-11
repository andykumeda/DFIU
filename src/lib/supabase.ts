import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const SHARE_TOKEN_HEADER = 'x-dfiu-share-token'

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Missing Supabase environment variables. App will not function correctly.')
}

// Fallback to avoid top-level crash. Queries will fail gracefully.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    global: {
      fetch: (input, init) => {
        const shareToken = getShareTokenFromUrl()
        if (!shareToken) return fetch(input, init)

        const headers = new Headers(init?.headers)
        headers.set(SHARE_TOKEN_HEADER, shareToken)
        return fetch(input, { ...init, headers })
      },
    },
  }
)

function getShareTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  if (!/^\/race\/[0-9a-f-]+(?:\/|$)/i.test(url.pathname)) return null
  const token = url.searchParams.get('share')?.trim()
  return token || null
}
