export type PaceChartColumnId =
    | 'location'
    | 'mile'
    | 'segMile'
    | 'segmentTime'
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
    { id: 'mile', label: 'Mile', shortLabel: 'Mi', align: 'left' },
    { id: 'segMile', label: 'Seg Mile', shortLabel: 'Seg Mi', align: 'left' },
    { id: 'segmentTime', label: 'Segment Time', shortLabel: 'Seg Time', align: 'right' },
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
}

export const DEFAULT_PACE_CHART_COLUMNS: PaceChartColumnsConfig = {
    order: [...DEFAULT_PACE_CHART_COLUMN_ORDER],
    hidden: [],
}

export function parsePaceChartColumns(raw: unknown): PaceChartColumnsConfig {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PACE_CHART_COLUMNS, order: [...DEFAULT_PACE_CHART_COLUMN_ORDER], hidden: [] }

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

    return { order, hidden }
}

export function getVisiblePaceChartColumns(config: PaceChartColumnsConfig, isKm: boolean): PaceChartColumnDef[] {
    const hidden = new Set(config.hidden)
    const byId = new Map(PACE_CHART_COLUMNS.map(c => [c.id, c]))
    return config.order
        .filter(id => !hidden.has(id))
        .map(id => {
            const col = byId.get(id)!
            if (id === 'mile') return { ...col, label: isKm ? 'Km' : 'Mile' }
            if (id === 'segMile') return { ...col, label: `Seg ${isKm ? 'Km' : 'Mile'}` }
            return col
        })
}
