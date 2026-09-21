export type TerrainTypeValue =
    | 'paved'
    | 'dirt'
    | 'runnable_trail'
    | 'smooth_dirt_gravel'
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
    { value: 'paved',            label: 'Paved',              defaultDifficulty: 100, color: '#3b82f6' },
    { value: 'dirt',             label: 'Non-technical',        defaultDifficulty: 104, color: '#eab308' },
    { value: 'technical',        label: 'Somewhat technical',    defaultDifficulty: 118, color: '#ef4444' },
    { value: 'highly_technical', label: 'Very technical',   defaultDifficulty: 130, color: '#7f1d1d' },
    { value: 'other',            label: 'Other',              defaultDifficulty: 100, color: '#9ca3af' },
]

const TERRAIN_BY_VALUE: Record<string, TerrainTypeDef> = Object.fromEntries(
    TERRAIN_TYPES.map(t => [t.value, t])
)

// Normalize older assignments before displaying/editing them. The stored
// difficulty remains independent of classification and is never rewritten here.
export function normalizeTerrainType(type: string): TerrainTypeValue {
    if (type === 'smooth_dirt_gravel') return 'dirt'
    if (['runnable_trail', 'double_track', 'single_track'].includes(type)) return 'technical'
    return type in TERRAIN_BY_VALUE ? type as TerrainTypeValue : 'other'
}

export function canMergeTerrainNodes(a: { type: string; difficulty: number | null }, b: { type: string; difficulty: number | null }): boolean {
    return normalizeTerrainType(a.type) === normalizeTerrainType(b.type)
        && (a.difficulty ?? 100) === (b.difficulty ?? 100)
}

export const DEFAULT_BASE_LAYER_COLOR = '#4b5563'
export const FALLBACK_TERRAIN_COLOR = '#9ca3af'

export function getTerrainDefaultDifficulty(type: string): number {
    return TERRAIN_BY_VALUE[normalizeTerrainType(type)]?.defaultDifficulty ?? 100
}

export function getTerrainColor(type: string): string {
    if (type === 'default') return DEFAULT_BASE_LAYER_COLOR
    return TERRAIN_BY_VALUE[normalizeTerrainType(type)]?.color ?? FALLBACK_TERRAIN_COLOR
}

export function getTerrainLabel(type: string): string {
    return TERRAIN_BY_VALUE[normalizeTerrainType(type)]?.label ?? type
}
