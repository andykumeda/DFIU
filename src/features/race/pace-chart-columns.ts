export type PaceChartColumnId =
    | 'location'
    | 'mile'
    | 'segMile'
    | 'segmentTime'
    | 'stopTime'
    | 'clockTime'
    | 'elapsedTime'
    | 'segmentPace'
    | 'overallPace'
    | 'cutoffTime'

export interface PaceChartColumnDef {
    id: PaceChartColumnId
    label: string
    shortLabel: string
    align: 'left' | 'right'
}

export const PACE_CHART_COLUMNS: PaceChartColumnDef[] = [
    { id: 'location', label: 'Location', shortLabel: 'Location', align: 'left' },
    { id: 'mile', label: 'Mile', shortLabel: 'Mi', align: 'right' },
    { id: 'segMile', label: 'Miles to Next', shortLabel: 'Next Mi', align: 'right' },
    { id: 'segmentTime', label: 'Time to Next', shortLabel: 'Next Time', align: 'right' },
    { id: 'stopTime', label: 'Stop', shortLabel: 'Stop', align: 'right' },
    { id: 'clockTime', label: 'Clock Time', shortLabel: 'Clock', align: 'right' },
    { id: 'elapsedTime', label: 'Elapsed Time', shortLabel: 'Elapsed', align: 'right' },
    { id: 'segmentPace', label: 'Segment Pace', shortLabel: 'Seg Pace', align: 'right' },
    { id: 'overallPace', label: 'Overall Pace', shortLabel: 'Avg Pace', align: 'right' },
    { id: 'cutoffTime', label: 'Cutoff Time', shortLabel: 'Cutoff', align: 'right' },
]

export const DEFAULT_PACE_CHART_COLUMN_ORDER: PaceChartColumnId[] = PACE_CHART_COLUMNS.map(c => c.id)

export interface PaceChartColumnsConfig {
    order: PaceChartColumnId[]
    hidden: PaceChartColumnId[]
    labels: Partial<Record<PaceChartColumnId, string>>
}

export const DEFAULT_PACE_CHART_COLUMNS: PaceChartColumnsConfig = {
    order: [...DEFAULT_PACE_CHART_COLUMN_ORDER],
    hidden: [],
    labels: {},
}

export function parsePaceChartColumns(raw: unknown): PaceChartColumnsConfig {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_PACE_CHART_COLUMNS, order: [...DEFAULT_PACE_CHART_COLUMN_ORDER], hidden: [], labels: {} }
    }

    const config = raw as Partial<PaceChartColumnsConfig>
    const validIds = new Set(PACE_CHART_COLUMNS.map(c => c.id))

    const order = Array.isArray(config.order)
        ? config.order.filter((id): id is PaceChartColumnId => typeof id === 'string' && validIds.has(id as PaceChartColumnId))
        : []
    for (const id of DEFAULT_PACE_CHART_COLUMN_ORDER) {
        if (!order.includes(id)) order.push(id)
    }

    const hidden = Array.isArray(config.hidden)
        ? config.hidden.filter((id): id is PaceChartColumnId => typeof id === 'string' && validIds.has(id as PaceChartColumnId))
        : []

    const labels: Partial<Record<PaceChartColumnId, string>> = {}
    if (config.labels && typeof config.labels === 'object') {
        for (const [key, value] of Object.entries(config.labels)) {
            if (!validIds.has(key as PaceChartColumnId) || typeof value !== 'string') continue
            const label = value.trim()
            if (label) labels[key as PaceChartColumnId] = label.slice(0, 40)
        }
    }

    return { order, hidden, labels }
}

export function getPaceChartColumnLabel(config: PaceChartColumnsConfig, id: PaceChartColumnId, isKm: boolean): string {
    const custom = config.labels?.[id]?.trim()
    if (custom) return custom

    const col = PACE_CHART_COLUMNS.find(c => c.id === id)
    if (id === 'mile') return isKm ? 'Km' : 'Mile'
    if (id === 'segMile') return isKm ? 'Km to Next' : 'Miles to Next'
    return col?.label ?? id
}

export function getVisiblePaceChartColumns(config: PaceChartColumnsConfig, isKm: boolean): PaceChartColumnDef[] {
    const hidden = new Set(config.hidden)
    const byId = new Map(PACE_CHART_COLUMNS.map(c => [c.id, c]))
    return config.order
        .filter(id => !hidden.has(id))
        .map(id => {
            const col = byId.get(id)!
            return { ...col, label: getPaceChartColumnLabel(config, id, isKm) }
        })
}
