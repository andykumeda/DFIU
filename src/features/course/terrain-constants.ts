export type TerrainTypeValue =
    | 'paved'
    | 'dirt'
    | 'runnable_trail'
    | 'technical'
    | 'highly_technical'
    // Legacy values remain readable so older courses retain their exact pacing.
    | 'double_track'
    | 'single_track'
    | 'other'

export interface TerrainTypeDef {
    value: TerrainTypeValue
    label: string
    defaultDifficulty: number
    color: string
}

export const TERRAIN_TYPES: readonly TerrainTypeDef[] = [
    { value: 'paved',            label: 'Paved / Road',       defaultDifficulty: 100, color: '#3b82f6' },
    { value: 'dirt',             label: 'Smooth Dirt / Gravel', defaultDifficulty: 104, color: '#eab308' },
    { value: 'runnable_trail',   label: 'Runnable Trail',     defaultDifficulty: 110, color: '#f97316' },
    { value: 'technical',        label: 'Technical Trail',    defaultDifficulty: 118, color: '#ef4444' },
    { value: 'highly_technical', label: 'Highly Technical',   defaultDifficulty: 130, color: '#7f1d1d' },
    { value: 'other',        label: 'Other',         defaultDifficulty: 100, color: '#9ca3af' },
]

const TERRAIN_BY_VALUE: Record<string, TerrainTypeDef> = Object.fromEntries(
    TERRAIN_TYPES.map(t => [t.value, t])
)

// Courses saved before the five-level vocabulary keep their original values.
// These aliases preserve their visual meaning without exposing legacy choices
// for new segments.
TERRAIN_BY_VALUE.double_track = TERRAIN_BY_VALUE.runnable_trail
TERRAIN_BY_VALUE.single_track = TERRAIN_BY_VALUE.technical

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
