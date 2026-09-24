import type { Content } from 'pdfmake/interfaces'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { DropBagCoverageRow } from './DropBagModal'

export interface PrintableDropBag {
    stationName: string
    bagName: string | null
    mile: number
    arrival: string | null
    cutoff: string | null
    items: Array<{ text: string; quantity?: string }>
    notes: string | null
    tellRunner: string | null
    nextLegReminder: string | null
    lighting: string | null
    coverageRows: DropBagCoverageRow[]
}

function detail(label: string, value: string | null): Content[] {
    if (!value?.trim()) return []
    return [
        { text: label.toUpperCase(), style: 'sectionLabel', margin: [0, 14, 0, 4] },
        { text: value.trim(), style: 'body' },
    ]
}

function coverage(row: DropBagCoverageRow): Content[] {
    const target = row.targetName
        ? [row.targetName, `Mile ${row.targetMile?.toFixed(1)} · +${row.milesUntil?.toFixed(1)} mi`]
        : ['None ahead']
    if (row.targetName) {
        for (const plan of row.plans) {
            if (plan.timeOfDay) target.push(`Arrival ${plan.timeOfDay}${plan.duration ? ` · in ${plan.duration}` : ''}`)
        }
    }
    return detail(row.label, target.join('\n'))
}

export function buildDropBagListDefinition(raceName: string, planLabel: string | null, bags: PrintableDropBag[]): TDocumentDefinitions {
    const content: Content[] = []
    bags.forEach((bag, index) => {
        content.push({
            text: `${raceName} · Drop Bag List${planLabel ? ` · ${planLabel}` : ''}`,
            style: 'eyebrow',
            pageBreak: index > 0 ? 'before' : undefined,
        })
        content.push({ text: bag.bagName || bag.stationName, style: 'bagTitle', margin: [0, 14, 0, 0] })
        if (bag.bagName && bag.bagName !== bag.stationName) {
            content.push({ text: bag.stationName, style: 'station', margin: [0, 3, 0, 0] })
        }
        const time = bag.arrival ? `${bag.mile === 0 ? 'Start time' : 'Arrival'} ${bag.arrival}` : null
        content.push({
            text: [`Mile ${bag.mile.toFixed(1)}`, time, bag.cutoff ? `Cutoff ${bag.cutoff}` : null].filter(Boolean).join('     '),
            style: 'metadata', margin: [0, 12, 0, 12],
        })
        content.push({ text: 'INSIDE THIS BAG', style: 'sectionLabel', margin: [0, 10, 0, 6] })
        if (bag.items.length) {
            content.push({
                ul: bag.items.map(item => `${item.quantity?.trim() ? `${item.quantity.trim()} × ` : ''}${item.text}`),
                style: 'body', margin: [0, 0, 0, 8],
            })
        } else {
            content.push({ text: 'No items packed yet.', style: 'body' })
        }
        content.push(...detail('Notes', bag.notes))
        content.push(...detail('Tell runner', bag.tellRunner))
        content.push(...detail('Next leg reminder', bag.nextLegReminder))
        content.push(...detail('Lighting', bag.lighting))
        bag.coverageRows.forEach(row => content.push(...coverage(row)))
    })

    return {
        pageSize: 'LETTER',
        pageMargins: [46, 42, 46, 46],
        info: { title: `${raceName} Drop Bag List` },
        content,
        defaultStyle: { font: 'Roboto', fontSize: 11, color: '#111827', lineHeight: 1.2 },
        styles: {
            eyebrow: { fontSize: 9, bold: true, color: '#6b7280' },
            bagTitle: { fontSize: 25, bold: true, color: '#111827' },
            station: { fontSize: 17, bold: true, color: '#374151' },
            metadata: { fontSize: 11, bold: true, color: '#374151' },
            sectionLabel: { fontSize: 9, bold: true, color: '#374151' },
            body: { fontSize: 11, color: '#111827' },
        },
        footer: (page, total) => ({ text: `${page} / ${total}`, alignment: 'right', margin: [0, 0, 46, 0], color: '#6b7280', fontSize: 9 }),
    }
}

export async function createDropBagListPdf(raceName: string, planLabel: string | null, bags: PrintableDropBag[]): Promise<Blob> {
    const [pdfModule, fontsModule] = await Promise.all([
        import('pdfmake/build/pdfmake.js'),
        import('pdfmake/build/vfs_fonts.js'),
    ])
    const pdfMake = pdfModule.default
    return new Promise<Blob>((resolve, reject) => {
        try {
            pdfMake.createPdf(buildDropBagListDefinition(raceName, planLabel, bags), undefined, undefined, fontsModule.default).getBlob(resolve)
        } catch (error) {
            reject(error)
        }
    })
}
