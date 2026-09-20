import type { Race, Waypoint } from '@/types/database'
import { getBagKind, hasSavedBagPlan } from './drop-bag-shared'

export const SUPPORT_OPTIONS = [
    { value: 'solo', label: 'Solo', description: 'No crew or pacer' },
    { value: 'crew', label: 'Crew only', description: 'Crew support, no pacer' },
    { value: 'pacer', label: 'Pacer only', description: 'Pacer support, no crew' },
    { value: 'both', label: 'Crew and pacer', description: 'Both types of support' },
] as const
export type SupportMode = typeof SUPPORT_OPTIONS[number]['value']

export function getRaceSupport(race: Pick<Race, 'support_mode'> | undefined) {
    const mode = race?.support_mode ?? 'both'
    return { mode, crew: mode === 'crew' || mode === 'both', pacer: mode === 'pacer' || mode === 'both' }
}

export function isVisibleBag(waypoint: Waypoint, hasCrew: boolean, canEdit: boolean) {
    const kind = getBagKind(waypoint)
    return !!kind && (kind !== 'crew' || (hasCrew && (canEdit || hasSavedBagPlan(waypoint))))
}
