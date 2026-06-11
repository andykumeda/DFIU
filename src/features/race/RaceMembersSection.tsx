import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Search, UserPlus, Mail, X, RefreshCw, Link as LinkIcon, Copy, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import type { Race } from '@/types/database'
import { buildShareLink, createShareToken } from './share-link'

type Role = 'crew' | 'pacer'
type Permission = 'view' | 'edit'
interface RoleSelection {
  crew: boolean
  pacer: boolean
}

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
  is_crew?: boolean | null
  is_pacer?: boolean | null
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
  const [pendingRoles, setPendingRoles] = useState<RoleSelection>({ crew: true, pacer: false })
  const [pendingPermission, setPendingPermission] = useState<Permission>('view')
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  const { data: raceAccess } = useQuery<Pick<Race, 'id' | 'public_share_enabled' | 'public_share_token'>>({
    queryKey: ['race-share-access', raceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('races')
        .select('id, public_share_enabled, public_share_token')
        .eq('id', raceId)
        .single()
      if (error) throw error
      return data as Pick<Race, 'id' | 'public_share_enabled' | 'public_share_token'>
    },
    enabled: canManage,
  })

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
    mutationFn: async (input: { userId: string; roles: RoleSelection; permission: Permission }) => {
      if (!hasAnyRole(input.roles)) throw new Error('Select at least one role.')
      const existing = members.find(member => member.user_id === input.userId)
      if (existing?.role === 'owner') throw new Error('Owners already have full access.')

      const payload = {
        race_id: raceId,
        user_id: input.userId,
        role: primaryRole(input.roles),
        permission: input.permission,
        is_crew: input.roles.crew,
        is_pacer: input.roles.pacer,
        is_runner: existing?.is_runner ?? false,
        granted_by: user?.id ?? null,
      }

      const { error } = existing
        ? await supabase
          .from('race_memberships')
          .update(payload)
          .eq('race_id', raceId)
          .eq('user_id', input.userId)
        : await supabase.from('race_memberships').insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      resetForm()
      await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      await refreshMemberships?.()
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; roles: RoleSelection; permission: Permission; resend?: boolean; sendEmail?: boolean }) => {
      if (!hasAnyRole(input.roles)) throw new Error('Select at least one role.')
      const { data, error } = await supabase.functions.invoke('invite-race-member', {
        body: {
          race_id: raceId,
          email: input.email,
          role: primaryRole(input.roles),
          roles: selectedRoleList(input.roles),
          is_crew: input.roles.crew,
          is_pacer: input.roles.pacer,
          permission: input.permission,
          resend: input.resend === true,
          send_email: input.sendEmail === true,
        },
      })
      if (error) throw new Error(await getFunctionErrorMessage(error))
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: async (data) => {
      const status = data?.status as string | undefined
      if (status === 'added_existing_user') {
        setInviteStatus('User already had an account — added directly.')
        await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      } else if (status === 'added_existing_user_email_sent') {
        setInviteStatus('User already had an account — added directly and sent a sign-in link.')
        await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      } else if (status === 'updated_existing_user') {
        setInviteStatus('Existing member updated.')
        await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      } else if (status === 'updated_existing_user_email_sent') {
        setInviteStatus('Existing member updated and sent a sign-in link.')
        await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      } else if (status === 'already_member') {
        setInviteStatus('Already a member of this race.')
      } else if (status === 'existing_user_email_failed') {
        setInviteStatus(`Member access was saved, but the sign-in link failed: ${data.message}`)
        await queryClient.invalidateQueries({ queryKey: ['race_members', raceId] })
      } else if (status === 'invite_email_failed') {
        setInviteStatus(`Pending invite saved, but email failed: ${data.message}`)
      } else if (status === 'resend_email_failed') {
        setInviteStatus(`Pending invite still saved, but resend failed: ${data.message}`)
      } else if (status === 'resent') {
        setInviteStatus('Invite email resent.')
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

  const shareMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const token = enabled
        ? raceAccess?.public_share_token || createShareToken()
        : null
      const { data, error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('races') as any)
        .update({
          public_share_enabled: enabled,
          public_share_token: token,
        })
        .eq('id', raceId)
        .select('id, public_share_enabled, public_share_token')
        .single()
      if (error) throw error
      return data as Pick<Race, 'id' | 'public_share_enabled' | 'public_share_token'>
    },
    onSuccess: async (data) => {
      setShareStatus(data.public_share_enabled ? 'Private read-only link is enabled.' : 'Private read-only link revoked.')
      await queryClient.invalidateQueries({ queryKey: ['race-share-access', raceId] })
      await queryClient.invalidateQueries({ queryKey: ['race', raceId] })
    },
    onError: (err: Error) => {
      setShareStatus(`Error: ${err.message}`)
    },
  })

  const resendPendingInvite = (invite: PendingInvite) => {
    inviteMutation.mutate({
      email: invite.email,
      roles: rolesFromPendingInvite(invite),
      permission: normalizePermission(invite.permission),
      resend: true,
    })
  }

  function resetForm(opts?: { keepStatus?: boolean }) {
    setEmailInput('')
    setFoundUser(null)
    setNoUserFound(false)
    setSearchedEmail(null)
    setPendingRoles({ crew: true, pacer: false })
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

  // The database still validates who may grant edit access; expose the full
  // choice here for managers so the permission control is usable.
  const permissionOptions: Permission[] = canManage ? ['view', 'edit'] : ['view']
  const inviteStatusIsError = inviteStatus?.startsWith('Error:') || inviteStatus?.toLowerCase().includes('failed')
  const shareStatusIsError = shareStatus?.startsWith('Error:')
  const shareLink = raceAccess?.public_share_enabled && raceAccess.public_share_token
    ? buildShareLink(raceId, raceAccess.public_share_token)
    : ''

  const copyShareLink = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setShareStatus('Private read-only link copied.')
      window.setTimeout(() => setShareStatus(null), 2500)
    } catch {
      window.prompt('Copy private read-only link:', shareLink)
    }
  }

  return (
    <div className='max-w-3xl mx-auto px-4 py-6 space-y-6'>
      <div>
        <h2 className='text-2xl font-bold text-white mb-1'>Members</h2>
        <p className='text-neutral-400 text-sm'>
          People with access to this race. Any member can invite others; only owners can grant edit permission or remove members.
        </p>
      </div>

      {canManage && (
        <div className='border border-blue-900/60 rounded-lg bg-blue-950/20 p-4 space-y-3'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <div className='flex items-center gap-2 text-white font-semibold'>
                <LinkIcon className='w-4 h-4 text-blue-300' /> Private read-only link
              </div>
              <p className='text-neutral-400 text-sm mt-1'>
                Share this event with anyone who has the exact link, without listing it in Public Events or granting edit access.
              </p>
            </div>
            <button
              type='button'
              onClick={() => shareMutation.mutate(!raceAccess?.public_share_enabled)}
              disabled={shareMutation.isPending || !raceAccess}
              className={`shrink-0 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 ${
                raceAccess?.public_share_enabled
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {shareMutation.isPending
                ? 'Saving...'
                : raceAccess?.public_share_enabled ? 'Revoke' : 'Enable'}
            </button>
          </div>

          {shareLink ? (
            <div className='flex flex-col sm:flex-row gap-2'>
              <input
                type='text'
                value={shareLink}
                readOnly
                aria-label='Private read-only share link'
                className='min-w-0 flex-1 bg-neutral-950 border border-blue-900/70 rounded px-3 py-2 text-sm text-blue-100'
              />
              <button
                type='button'
                onClick={copyShareLink}
                className='inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded text-sm font-medium'
              >
                <Copy className='w-4 h-4' />
                Copy
              </button>
              <a
                href={shareLink}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center justify-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded text-sm font-medium'
              >
                <ExternalLink className='w-4 h-4' />
                Open
              </a>
            </div>
          ) : (
            <p className='text-neutral-500 text-sm'>Enable the link to generate a private read-only URL.</p>
          )}

          {shareStatus && <p className={`text-sm ${shareStatusIsError ? 'text-red-400' : 'text-emerald-400'}`}>{shareStatus}</p>}
        </div>
      )}

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
                      {formatPendingRoles(p)} · {p.permission}
                      {p.invited_by_name ? ` · invited by ${p.invited_by_name}` : ''}
                    </div>
                  </div>
                  <div className='flex items-center gap-1'>
                    <button
                      onClick={() => resendPendingInvite(p)}
                      className='p-1.5 text-blue-300 hover:text-blue-200 hover:bg-blue-900/20 rounded'
                      disabled={inviteMutation.isPending}
                      title='Resend invite email'
                    >
                      <RefreshCw className='w-4 h-4' />
                    </button>
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
                  </div>
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
          {inviteStatus && <p className={`text-sm ${inviteStatusIsError ? 'text-red-400' : 'text-emerald-400'}`}>{inviteStatus}</p>}

          {foundUser && (
            <AddCard
              foundUser={foundUser}
              email={searchedEmail ?? emailInput.trim()}
              roles={pendingRoles}
              setRoles={setPendingRoles}
              permission={pendingPermission}
              setPermission={setPendingPermission}
              permissionOptions={permissionOptions}
              onAdd={() =>
                addMutation.mutate({
                  userId: foundUser.id,
                  roles: pendingRoles,
                  permission: pendingPermission,
                })
              }
              onAddAndNotify={() =>
                inviteMutation.mutate({
                  email: searchedEmail ?? emailInput.trim(),
                  roles: pendingRoles,
                  permission: pendingPermission,
                  sendEmail: true,
                })
              }
              isAdding={addMutation.isPending}
              isSendingLink={inviteMutation.isPending}
              error={addMutation.isError ? (addMutation.error as Error).message : null}
            />
          )}

          {noUserFound && searchedEmail && (
            <InviteCard
              email={searchedEmail}
              roles={pendingRoles}
              setRoles={setPendingRoles}
              permission={pendingPermission}
              setPermission={setPendingPermission}
              permissionOptions={permissionOptions}
              onInvite={() =>
                inviteMutation.mutate({
                  email: searchedEmail,
                  roles: pendingRoles,
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
  email: string
  roles: RoleSelection
  setRoles: (roles: RoleSelection) => void
  permission: Permission
  setPermission: (p: Permission) => void
  permissionOptions: Permission[]
  onAdd: () => void
  onAddAndNotify: () => void
  isAdding: boolean
  isSendingLink: boolean
  error: string | null
}

function AddCard({
  foundUser, email, roles, setRoles, permission, setPermission, permissionOptions, onAdd, onAddAndNotify, isAdding, isSendingLink, error,
}: AddCardProps) {
  const isPending = isAdding || isSendingLink

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
        <div>
          <div className='text-white text-sm'>{foundUser.name ?? 'Unnamed user'}</div>
          <div className='text-xs text-neutral-500'>{email}</div>
        </div>
      </div>
      <RolePermFields
        roles={roles} setRoles={setRoles}
        permission={permission} setPermission={setPermission}
        permissionOptions={permissionOptions}
      />
      <div className='flex flex-wrap justify-end gap-2'>
        <button
          onClick={onAdd}
          disabled={isPending || !hasAnyRole(roles)}
          className='bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium'
        >
          {isAdding ? 'Adding…' : 'Add'}
        </button>
        <button
          onClick={onAddAndNotify}
          disabled={isPending || !email || !hasAnyRole(roles)}
          className='flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium'
        >
          <Mail className='w-4 h-4' />
          {isSendingLink ? 'Sending…' : 'Add & send link'}
        </button>
      </div>
      {error && <p className='text-sm text-red-400'>{error}</p>}
    </div>
  )
}

interface InviteCardProps {
  email: string
  roles: RoleSelection
  setRoles: (roles: RoleSelection) => void
  permission: Permission
  setPermission: (p: Permission) => void
  permissionOptions: Permission[]
  onInvite: () => void
  isPending: boolean
}

function InviteCard({
  email, roles, setRoles, permission, setPermission, permissionOptions, onInvite, isPending,
}: InviteCardProps) {
  return (
    <div className='border border-neutral-700 rounded p-3 bg-neutral-950 space-y-3'>
      <div className='text-sm text-neutral-300'>
        No DFIU account for <span className='text-white font-medium'>{email}</span>. Send an invite email — they'll set a password and join automatically.
      </div>
      <RolePermFields
        roles={roles} setRoles={setRoles}
        permission={permission} setPermission={setPermission}
        permissionOptions={permissionOptions}
      />
      <div className='flex justify-end'>
        <button
          onClick={onInvite}
          disabled={isPending || !hasAnyRole(roles)}
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
  roles: RoleSelection
  setRoles: (roles: RoleSelection) => void
  permission: Permission
  setPermission: (p: Permission) => void
  permissionOptions: Permission[]
}

function RolePermFields({ roles, setRoles, permission, setPermission, permissionOptions }: RolePermFieldsProps) {
  const toggleRole = (role: Role, checked: boolean) => {
    const next = { ...roles, [role]: checked }
    if (!hasAnyRole(next)) return
    setRoles(next)
  }

  return (
    <div className='flex flex-wrap gap-3 items-center'>
      <fieldset className='text-sm text-neutral-300 flex flex-wrap items-center gap-2'>
        <legend className='sr-only'>Roles</legend>
        <span>Roles</span>
        <label className='inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-white'>
          <input
            type='checkbox'
            checked={roles.crew}
            onChange={(e) => toggleRole('crew', e.target.checked)}
            className='accent-emerald-500'
          />
          Crew
        </label>
        <label className='inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-white'>
          <input
            type='checkbox'
            checked={roles.pacer}
            onChange={(e) => toggleRole('pacer', e.target.checked)}
            className='accent-blue-500'
          />
          Pacer
        </label>
      </fieldset>
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

function hasAnyRole(roles: RoleSelection): boolean {
  return roles.crew || roles.pacer
}

function primaryRole(roles: RoleSelection): Role {
  return roles.crew ? 'crew' : 'pacer'
}

function selectedRoleList(roles: RoleSelection): Role[] {
  return (['crew', 'pacer'] as Role[]).filter(role => roles[role])
}

function formatRoles(member: Member): string {
  const roles: string[] = []
  if (member.is_runner || member.role === 'owner') roles.push('runner')
  if (member.is_crew || member.role === 'crew') roles.push('crew')
  if (member.is_pacer || member.role === 'pacer') roles.push('pacer')
  return roles.length ? roles.join(' + ') : member.role
}

function formatPendingRoles(invite: PendingInvite): string {
  const roles: string[] = []
  if (invite.is_crew || (!invite.is_crew && !invite.is_pacer && invite.role === 'crew')) roles.push('crew')
  if (invite.is_pacer || (!invite.is_crew && !invite.is_pacer && invite.role === 'pacer')) roles.push('pacer')
  return roles.length ? roles.join(' + ') : invite.role
}

function rolesFromPendingInvite(invite: PendingInvite): RoleSelection {
  const roles = {
    crew: !!invite.is_crew || (!invite.is_crew && !invite.is_pacer && invite.role === 'crew'),
    pacer: !!invite.is_pacer || (!invite.is_crew && !invite.is_pacer && invite.role === 'pacer'),
  }
  return hasAnyRole(roles) ? roles : { crew: true, pacer: false }
}

function normalizePermission(permission: string): Permission {
  return permission === 'edit' ? 'edit' : 'view'
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context
  if (context) {
    try {
      const body = await context.clone().json() as { error?: string; message?: string; status?: string }
      if (body.error) return body.error
      if (body.message) return body.message
      if (body.status) return body.status
    } catch {
      try {
        const text = await context.clone().text()
        if (text) return text
      } catch {
        // Fall through to the generic error below.
      }
    }
  }
  return error instanceof Error ? error.message : 'Invite failed'
}
