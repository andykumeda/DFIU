import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Search, UserPlus, Mail, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'

type Role = 'crew' | 'pacer'
type Permission = 'view' | 'edit'

interface Member {
  user_id: string
  role: string
  permission: string
  is_runner: boolean
  is_pacer: boolean
  is_crew: boolean
  name: string | null
  avatar_url: string | null
  granted_at: string
}

interface PendingInvite {
  id: string
  email: string
  role: string
  permission: string
  invited_by: string | null
  invited_by_name: string | null
  created_at: string
}

interface FoundUser {
  id: string
  name: string | null
  avatar_url: string | null
}

interface Props {
  raceId: string
  canInvite: boolean
  canManage: boolean
}

export function RaceMembersSection({ raceId, canInvite, canManage }: Props) {
  const queryClient = useQueryClient()
  const { user, refreshMemberships } = useAuth()
  const [emailInput, setEmailInput] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null)
  const [searchedEmail, setSearchedEmail] = useState<string | null>(null)
  const [noUserFound, setNoUserFound] = useState(false)
  const [pendingRole, setPendingRole] = useState<Role>('crew')
  const [pendingPermission, setPendingPermission] = useState<Permission>('view')
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['race_members', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_race_members', { p_race_id: raceId })
      if (error) throw error
      return (data ?? []) as Member[]
    },
  })

  const { data: pending = [] } = useQuery<PendingInvite[]>({
    queryKey: ['race_pending_invites', raceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_race_invites', { p_race_id: raceId })
      if (error) throw error
      return (data ?? []) as PendingInvite[]
    },
    enabled: canInvite,
  })

  const searchMutation = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc('find_user_by_email', { p_email: email })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
    onSuccess: (data, email) => {
      setSearchedEmail(email)
      setInviteStatus(null)
      if (!data) {
        setFoundUser(null)
        setNoUserFound(true)
        setSearchError(null)
      } else {
        setFoundUser(data as FoundUser)
        setNoUserFound(false)
        setSearchError(null)
      }
    },
    onError: (err: Error) => {
      setFoundUser(null)
      setNoUserFound(false)
      setSearchError(err.message)
    },
  })

  const addMutation = useMutation({
    mutationFn: async (input: { userId: string; role: Role; permission: Permission }) => {
      const { error } = await supabase.from('race_memberships').insert({
        race_id: raceId,
        user_id: input.userId,
        role: input.role,
        permission: 'view',
        is_crew: input.role === 'crew',
        is_pacer: input.role === 'pacer',
        is_runner: false,
        granted_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      resetForm()
      await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      await refreshMemberships?.()
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; role: Role; permission: Permission }) => {
      const { data, error } = await supabase.functions.invoke('invite-race-member', {
        body: {
          race_id: raceId,
          email: input.email,
          role: input.role,
          permission: input.permission,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: async (data) => {
      const status = data?.status as string | undefined
      if (status === 'added_existing_user') {
        setInviteStatus('User already had an account — added directly.')
        await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      } else if (status === 'already_member') {
        setInviteStatus('Already a member of this race.')
      } else if (status === 'invite_email_failed') {
        setInviteStatus(`Pending invite saved, but email failed: ${data.message}`)
      } else {
        setInviteStatus('Invite email sent.')
      }
      await queryClient.invalidateQueries({ queryKey: ['race_pending_invites', raceId] })
      await refreshMemberships?.()
      resetForm({ keepStatus: true })
    },
    onError: (err: Error) => {
      setInviteStatus(`Error: ${err.message}`)
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

  const cancelPendingMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pending_race_memberships').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['race_pending_invites', raceId] })
    },
  })

  function resetForm(opts?: { keepStatus?: boolean }) {
    setEmailInput('')
    setFoundUser(null)
    setNoUserFound(false)
    setSearchedEmail(null)
    setPendingRole('crew')
    setPendingPermission('view')
    if (!opts?.keepStatus) setInviteStatus(null)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = emailInput.trim()
    if (!trimmed) return
    setSearchError(null)
    setInviteStatus(null)
    searchMutation.mutate(trimmed)
  }

  // Team members are view/log only in the role-view model. Route/map editing
  // stays with official race directors and runner-plan owners.
  const permissionOptions: Permission[] = ['view']

  return (
    <div className='max-w-3xl mx-auto px-4 py-6 space-y-6'>
      <div>
        <h2 className='text-2xl font-bold text-white mb-1'>Members</h2>
        <p className='text-neutral-400 text-sm'>
          People with access to this race. Any member can invite others; only owners can grant edit permission or remove members.
        </p>
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
                    {formatRoles(m)} · view/log
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

      {canInvite && pending.length > 0 && (
        <div className='border border-neutral-800 rounded-lg bg-neutral-900 p-4 space-y-3'>
          <div className='flex items-center gap-2 text-white font-semibold'>
            <Mail className='w-4 h-4' /> Pending invites
          </div>
          <ul className='space-y-2'>
            {pending.map((p) => {
              const canCancel = canManage || p.invited_by === user?.id
              return (
                <li
                  key={p.id}
                  className='flex items-center justify-between gap-3 p-2 rounded border border-neutral-800 bg-neutral-950'
                >
                  <div className='min-w-0'>
                    <div className='text-white text-sm truncate'>{p.email}</div>
                    <div className='text-neutral-500 text-xs uppercase tracking-wide'>
                      {p.role} · {p.permission}
                      {p.invited_by_name ? ` · invited by ${p.invited_by_name}` : ''}
                    </div>
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => cancelPendingMutation.mutate(p.id)}
                      className='p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded'
                      disabled={cancelPendingMutation.isPending}
                      title='Cancel invite'
                    >
                      <X className='w-4 h-4' />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {canInvite && (
        <div className='border border-neutral-800 rounded-lg p-4 bg-neutral-900 space-y-4'>
          <div className='flex items-center gap-2 text-white font-semibold'>
            <UserPlus className='w-4 h-4' /> Add or invite member
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
          {inviteStatus && <p className='text-sm text-emerald-400'>{inviteStatus}</p>}

          {foundUser && (
            <AddCard
              foundUser={foundUser}
              role={pendingRole}
              setRole={setPendingRole}
              permission={pendingPermission}
              setPermission={setPendingPermission}
              permissionOptions={permissionOptions}
              onAdd={() =>
                addMutation.mutate({
                  userId: foundUser.id,
                  role: pendingRole,
                  permission: pendingPermission,
                })
              }
              isPending={addMutation.isPending}
              error={addMutation.isError ? (addMutation.error as Error).message : null}
            />
          )}

          {noUserFound && searchedEmail && (
            <InviteCard
              email={searchedEmail}
              role={pendingRole}
              setRole={setPendingRole}
              permission={pendingPermission}
              setPermission={setPendingPermission}
              permissionOptions={permissionOptions}
              onInvite={() =>
                inviteMutation.mutate({
                  email: searchedEmail,
                  role: pendingRole,
                  permission: pendingPermission,
                })
              }
              isPending={inviteMutation.isPending}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface AddCardProps {
  foundUser: FoundUser
  role: Role
  setRole: (r: Role) => void
  permission: Permission
  setPermission: (p: Permission) => void
  permissionOptions: Permission[]
  onAdd: () => void
  isPending: boolean
  error: string | null
}

function AddCard({
  foundUser, role, setRole, permission, setPermission, permissionOptions, onAdd, isPending, error,
}: AddCardProps) {
  return (
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
      <RolePermFields
        role={role} setRole={setRole}
        permission={permission} setPermission={setPermission}
        permissionOptions={permissionOptions}
      />
      <div className='flex justify-end'>
        <button
          onClick={onAdd}
          disabled={isPending}
          className='bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium'
        >
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && <p className='text-sm text-red-400'>{error}</p>}
    </div>
  )
}

interface InviteCardProps {
  email: string
  role: Role
  setRole: (r: Role) => void
  permission: Permission
  setPermission: (p: Permission) => void
  permissionOptions: Permission[]
  onInvite: () => void
  isPending: boolean
}

function InviteCard({
  email, role, setRole, permission, setPermission, permissionOptions, onInvite, isPending,
}: InviteCardProps) {
  return (
    <div className='border border-neutral-700 rounded p-3 bg-neutral-950 space-y-3'>
      <div className='text-sm text-neutral-300'>
        No DFIU account for <span className='text-white font-medium'>{email}</span>. Send an invite email — they'll set a password and join automatically.
      </div>
      <RolePermFields
        role={role} setRole={setRole}
        permission={permission} setPermission={setPermission}
        permissionOptions={permissionOptions}
      />
      <div className='flex justify-end'>
        <button
          onClick={onInvite}
          disabled={isPending}
          className='flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium'
        >
          <Mail className='w-4 h-4' />
          {isPending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </div>
  )
}

interface RolePermFieldsProps {
  role: Role
  setRole: (r: Role) => void
  permission: Permission
  setPermission: (p: Permission) => void
  permissionOptions: Permission[]
}

function RolePermFields({ role, setRole, permission, setPermission, permissionOptions }: RolePermFieldsProps) {
  return (
    <div className='flex flex-wrap gap-3 items-center'>
      <label className='text-sm text-neutral-300 flex items-center gap-2'>
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className='bg-neutral-800 border border-neutral-700 rounded text-sm text-white px-2 py-1'
        >
          <option value='crew'>Crew</option>
          <option value='pacer'>Pacer</option>
        </select>
      </label>
      <label className='text-sm text-neutral-300 flex items-center gap-2'>
        Permission
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value as Permission)}
          className='bg-neutral-800 border border-neutral-700 rounded text-sm text-white px-2 py-1'
          disabled={permissionOptions.length === 1}
        >
          {permissionOptions.includes('view') && <option value='view'>View</option>}
          {permissionOptions.includes('edit') && <option value='edit'>Edit</option>}
        </select>
      </label>
    </div>
  )
}

function formatRoles(member: Member): string {
  const roles: string[] = []
  if (member.is_runner || member.role === 'owner') roles.push('runner')
  if (member.is_crew || member.role === 'crew') roles.push('crew')
  if (member.is_pacer || member.role === 'pacer') roles.push('pacer')
  return roles.length ? roles.join(' + ') : member.role
}
