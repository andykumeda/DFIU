import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export interface MembershipInfo {
  role: 'owner' | 'crew' | 'pacer'
  permission: 'view' | 'edit'
}

interface AuthContextType {
  user: User | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any
  loading: boolean
  isSiteAdmin: boolean
  memberships: Record<string, MembershipInfo>
  refreshProfile?: () => Promise<void>
  refreshMemberships?: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isSiteAdmin: false,
  memberships: {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isSiteAdmin, setIsSiteAdmin] = useState(false)
  const [memberships, setMemberships] = useState<Record<string, MembershipInfo>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadAuthData(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadAuthData(session.user.id)
      } else {
        setProfile(null)
        setIsSiteAdmin(false)
        setMemberships({})
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadAuthData(userId: string) {
    try {
      await Promise.all([fetchProfile(userId), fetchAdminAndMemberships(userId)])
    } finally {
      setLoading(false)
    }
  }

  async function fetchProfile(userId: string) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      setProfile(data)
    } catch (e) {
      console.error('Error fetching profile', e)
    }
  }

  async function fetchAdminAndMemberships(userId: string) {
    try {
      const [adminRes, memRes] = await Promise.all([
        supabase.from('site_admins').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase.from('race_memberships').select('race_id, role, permission').eq('user_id', userId),
      ])
      setIsSiteAdmin(!!adminRes.data)
      const map: Record<string, MembershipInfo> = {}
      for (const m of memRes.data ?? []) {
        map[m.race_id] = {
          role: m.role as MembershipInfo['role'],
          permission: m.permission as MembershipInfo['permission'],
        }
      }
      setMemberships(map)
    } catch (e) {
      console.error('Error fetching admin/memberships', e)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isSiteAdmin,
        memberships,
        refreshProfile: async () => { if (user) await fetchProfile(user.id) },
        refreshMemberships: async () => { if (user) await fetchAdminAndMemberships(user.id) },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
