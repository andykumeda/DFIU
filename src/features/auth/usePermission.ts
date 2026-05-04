import { useAuth } from './AuthContext'

export interface Permission {
  canView: boolean
  canEdit: boolean
  isOwner: boolean
  isAdmin: boolean
}

// Resolves a user's permission for a given race using the membership map
// loaded by AuthContext. Public-race read access is handled at the data
// layer (RLS); this hook only governs UI gating, so unknown raceId returns
// no-perm for non-admins.
export function usePermission(raceId: string | undefined): Permission {
  const { user, isSiteAdmin, memberships } = useAuth()

  if (!user || !raceId) {
    return { canView: false, canEdit: false, isOwner: false, isAdmin: false }
  }

  if (isSiteAdmin) {
    return { canView: true, canEdit: true, isOwner: true, isAdmin: true }
  }

  const m = memberships[raceId]
  if (!m) {
    return { canView: false, canEdit: false, isOwner: false, isAdmin: false }
  }

  return {
    canView: true,
    canEdit: m.permission === 'edit',
    isOwner: m.role === 'owner',
    isAdmin: false,
  }
}
