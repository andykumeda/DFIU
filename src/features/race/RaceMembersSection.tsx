import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Search, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'

type Role = 'crew' | 'pacer'
type Permission = 'view' | 'edit'

interface Member {
  user_id: string
  role: string
  permission: string
  name: string | null
  avatar_url: string | null
  granted_at: string
}

interface FoundUser {
  id: string
  name: string | null
  avatar_url: string | null
}

interface Props {
  raceId: string
  canManage: boolean
}

export function RaceMembersSection({ raceId, canManage }: Props) {
  const queryClient = useQueryClient()
  const { user, refreshMemberships } = useAuth()
  const [emailInput, setEmailInput] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)
  const [pendingRole, setPendingRole] = useState<Role>('crew')
  const [pendingPermission, setPendingPermission] = useState<Permission>('view')

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['race_members', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_race_members', { p_race_id: raceId })
      if (error) throw error
      return (data ?? []) as Member[]
    },
  })

  const searchMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('find_user_by_email', { p_email: email })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
    onSuccess: (data) => {
      if (!data) {
        setFoundUser(null)
        setSearchError('No user found with that email. They must have a DFIU account first.')
      } else {
        setFoundUser(data as FoundUser)
        setSearchError(null)
      }
    },
    onError: (err: Error) => {
      setFoundUser(null)
      setSearchError(err.message)
    },
  })

  const addMutation = useMutation({
    mutationFn: async (input: { userId: string; role: Role; permission: Permission }) => {
      const { error } = await supabase.from('race_memberships').insert({
        race_id: raceId,
        user_id: input.userId,
        role: input.role,
        permission: input.permission,
        granted_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setEmailInput('')
      setFoundUser(null)
      setPendingRole('crew')
      setPendingPermission('view')
      await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      await refreshMemberships?.()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (input: { userId: string; permission: Permission }) => {
      const { error } = await supabase
        .from('race_memberships')
        .update({ permission: input.permission })
        .eq('race_id', raceId)
        .eq('user_id', input.userId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      await refreshMemberships?.()
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('race_memberships')
        .delete()
        .eq('race_id', raceId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      await refreshMemberships?.()
    },
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = emailInput.trim()
    if (!trimmed) return
    setSearchError(null)
    searchMutation.mutate(trimmed)
  }

  return (
    <div className='max-w-3xl mx-auto px-4 py-6 space-y-6'>
      <div>
        <h2 className='text-2xl font-bold text-white mb-1'>Members</h2>
        <p className='text-neutral-400 text-sm'>People with access to this race. Owners and admins can add or remove crew and pacers.</p>
      </div>

      {isLoading ? (
        <div className='text-neutral-400 text-sm'>Loading members…</div>
      ) : (
        <ul className='space-y-2'>
          {members.map((m) => (
            <li
              key={m.user_id}
              className='flex items-center justify-between gap-4 p-3 rounded-lg border border-neutral-800 bg-neutral-900'
            >
              <div className='flex items-center gap-3 min-w-0'>
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt='' className='w-8 h-8 rounded-full object-cover shrink-0' />
                ) : (
                  <div className='w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs text-neutral-300 shrink-0'>
                    {(m.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className='min-w-0'>
                  <div className='text-white text-sm font-medium truncate'>{m.name ?? 'Unnamed user'}</div>
                  <div className='text-neutral-500 text-xs uppercase tracking-wide'>
                    {m.role} · {m.permission}
                  </div>
                </div>
              </div>
              {canManage && m.role !== 'owner' && (
                <div className='flex items-center gap-2'>
                  <select
                    value={m.permission}
                    onChange={(e) =>
                      updateMutation.mutate({
                        userId: m.user_id,
                        permission: e.target.value as Permission,
                      })
                    }
                    className='bg-neutral-800 border border-neutral-700 rounded text-sm text-white px-2 py-1'
                    disabled={updateMutation.isPending}
                  >
                    <option value='view'>View</option>
                    <option value='edit'>Edit</option>
                  </select>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${m.name ?? 'this user'} from the race?`)) {
                        removeMutation.mutate(m.user_id)
                      }
                    }}
                    className='p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors'
                    disabled={removeMutation.isPending}
                    title='Remove member'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className='border border-neutral-800 rounded-lg p-4 bg-neutral-900 space-y-4'>
          <div className='flex items-center gap-2 text-white font-semibold'>
            <UserPlus className='w-4 h-4' /> Add member
          </div>

          <form onSubmit={handleSearch} className='flex gap-2'>
            <input
              type='email'
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder='user@example.com'
              className='flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white placeholder:text-neutral-500'
            />
            <button
              type='submit'
              disabled={searchMutation.isPending || !emailInput.trim()}
              className='flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded text-sm font-medium'
            >
              <Search className='w-4 h-4' />
              Search
            </button>
          </form>

          {searchError && <p className='text-sm text-red-400'>{searchError}</p>}

          {foundUser && (
            <div className='border border-neutral-700 rounded p-3 bg-neutral-950 space-y-3'>
              <div className='flex items-center gap-3'>
                {foundUser.avatar_url ? (
                  <img src={foundUser.avatar_url} alt='' className='w-8 h-8 rounded-full object-cover' />
                ) : (
                  <div className='w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-xs text-neutral-300'>
                    {(foundUser.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className='text-white text-sm'>{foundUser.name ?? 'Unnamed user'}</div>
              </div>
              <div className='flex flex-wrap gap-3 items-center'>
                <label className='text-sm text-neutral-300 flex items-center gap-2'>
                  Role
                  <select
                    value={pendingRole}
                    onChange={(e) => setPendingRole(e.target.value as Role)}
                    className='bg-neutral-800 border border-neutral-700 rounded text-sm text-white px-2 py-1'
                  >
                    <option value='crew'>Crew</option>
                    <option value='pacer'>Pacer</option>
                  </select>
                </label>
                <label className='text-sm text-neutral-300 flex items-center gap-2'>
                  Permission
                  <select
                    value={pendingPermission}
                    onChange={(e) => setPendingPermission(e.target.value as Permission)}
                    className='bg-neutral-800 border border-neutral-700 rounded text-sm text-white px-2 py-1'
                  >
                    <option value='view'>View</option>
                    <option value='edit'>Edit</option>
                  </select>
                </label>
                <button
                  onClick={() =>
                    addMutation.mutate({
                      userId: foundUser.id,
                      role: pendingRole,
                      permission: pendingPermission,
                    })
                  }
                  disabled={addMutation.isPending}
                  className='ml-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium'
                >
                  {addMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
              {addMutation.isError && (
                <p className='text-sm text-red-400'>
                  {(addMutation.error as Error).message}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
