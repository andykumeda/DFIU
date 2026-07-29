import { useAuth } from './AuthContext'

export interface Permission {
  canView: boolean
  canEdit: boolean
  /** Owner, race director, or runner/owner with edit (aligned with RLS user_can_edit_race). */
  canEditRaceSettings: boolean
  isOwner: boolean
  isAdmin: boolean
  isRunner: boolean
  isPacer: boolean
  isCrew: boolean
  canManageTeam: boolean
  canLogCheckins: boolean
  availableRoleViews: Array<'full' | 'runner' | 'crew' | 'pacer'>
}

const emptyPermission: Permission = {
  canView: false,
  canEdit: false,
  canEditRaceSettings: false,
  isOwner: false,
  isAdmin: false,
  isRunner: false,
  isPacer: false,
  isCrew: false,
  canManageTeam: false,
  canLogCheckins: false,
  availableRoleViews: [],
}

// Resolves a user's permission for a given race using the membership map
// loaded by AuthContext. Public-race read access is handled at the data
// layer (RLS); this hook only governs UI gating, so unknown raceId returns
// no-perm for non-admins.
export function usePermission(raceId: string | undefined, raceDirectorUserId?: string | null): Permission {
  const { user, isSiteAdmin, memberships } = useAuth()

  if (!user || !raceId) {
    return emptyPermission
  }

  if (isSiteAdmin) {
    return {
      canView: true,
      canEdit: true,
      canEditRaceSettings: true,
      isOwner: true,
      isAdmin: true,
      isRunner: false,
      isPacer: false,
      isCrew: false,
      canManageTeam: true,
      canLogCheckins: true,
      availableRoleViews: ['full'],
    }
  }

  const m = memberships[raceId]
  if (!m) {
    return emptyPermission
  }

  const views: Permission['availableRoleViews'] = ['full']
  if (m.isRunner) views.push('runner')
  if (m.isCrew) views.push('crew')
  if (m.isPacer) views.push('pacer')

  const isRaceDirector = !!raceDirectorUserId && raceDirectorUserId === user.id

  return {
    canView: true,
    canEdit: m.permission === 'edit' && (m.role === 'owner' || m.isRunner),
    canEditRaceSettings: m.role === 'owner' || isRaceDirector || (m.permission === 'edit' && m.isRunner),
    isOwner: m.role === 'owner',
    isAdmin: false,
    isRunner: m.isRunner,
    isPacer: m.isPacer,
    isCrew: m.isCrew,
    canManageTeam: m.role === 'owner' || m.isRunner,
    canLogCheckins: m.role === 'owner' || m.isRunner || m.isCrew || m.isPacer,
    availableRoleViews: views,
  }
}
