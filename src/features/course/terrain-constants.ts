export type TerrainTypeValue =
    | 'paved'
    | 'dirt'
    | 'double_track'
    | 'single_track'
    | 'technical'
    | 'other'

export interface TerrainTypeDef {
    value: TerrainTypeValue
    label: string
    defaultDifficulty: number
    color: string
}

export const TERRAIN_TYPES: readonly TerrainTypeDef[] = [
    { value: 'paved',        label: 'Paved / Road',  defaultDifficulty: 100, color: '#3b82f6' },
    { value: 'dirt',         label: 'Dirt Road',     defaultDifficulty: 104, color: '#eab308' },
    { value: 'double_track', label: 'Double Track',  defaultDifficulty: 108, color: '#f97316' },
    { value: 'single_track', label: 'Single Track',  defaultDifficulty: 115, color: '#ef4444' },
    { value: 'technical',    label: 'Technical',     defaultDifficulty: 130, color: '#7f1d1d' },
    { value: 'other',        label: 'Other',         defaultDifficulty: 100, color: '#9ca3af' },
]

const TERRAIN_BY_VALUE: Record<string, TerrainTypeDef> = Object.fromEntries(
    TERRAIN_TYPES.map(t => [t.value, t])
)

export const DEFAULT_BASE_LAYER_COLOR = '#4b5563'
export const FALLBACK_TERRAIN_COLOR = '#9ca3af'

export function getTerrainDefaultDifficulty(type: string): number {
    return TERRAIN_BY_VALUE[type]?.defaultDifficulty ?? 100
}

export function getTerrainColor(type: string): string {
    if (type === 'default') return DEFAULT_BASE_LAYER_COLOR
    return TERRAIN_BY_VALUE[type]?.color ?? FALLBACK_TERRAIN_COLOR
}

export function getTerrainLabel(type: string): string {
    return TERRAIN_BY_VALUE[type]?.label ?? type
}
