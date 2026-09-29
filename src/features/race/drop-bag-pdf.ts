import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { defaultUrlTransform } from 'react-markdown'
import type { Root, RootContent, PhrasingContent, Definition } from 'mdast'
import type { Content, ContentText, Style } from 'pdfmake/interfaces'
import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import type { DropBagCoverageRow } from './DropBagModal'

export interface PrintableDropBag {
    stationName: string
    bagName: string | null
    mile: number
    arrival: string | null
    cutoff: string | null
    items: Array<{ text: string; quantity?: string }>
    crewItems: Array<{ text: string; quantity?: string; checked: boolean }> | null
    crewNotes: string | null
    textFields: Array<{ label: string; value: string }>
    notes: string | null
    tellRunner: string | null
    nextLegReminder: string | null
    coverageRows: DropBagCoverageRow[]
}

// Reuse the parser behind the app's Markdown renderer, including GFM lists/tables.
const markdownParser = unified().use(remarkParse).use(remarkGfm)

export function markdownPdfContent(value: string): Content[] {
    const root = markdownParser.parse(value) as Root
    const definitions = new Map<string, Definition>()
    for (const node of root.children) {
        if (node.type === 'definition') definitions.set(node.identifier.toLowerCase(), node)
    }
    function inline(nodes: PhrasingContent[], style: Style = {}): ContentText[] {
        return nodes.flatMap((node): ContentText[] => {
            if (node.type === 'text') return [{ text: node.value, ...style }]
            if (node.type === 'break') return [{ text: '\n', ...style }]
            if (node.type === 'inlineCode') return [{ text: node.value, ...style, background: '#f3f4f6' }]
            if (node.type === 'image' || node.type === 'imageReference') return [{ text: node.alt || '', ...style }]
            if (node.type === 'html') return [{ text: node.value, ...style }]
            if (node.type === 'link' || node.type === 'linkReference') {
                const url = node.type === 'link' ? node.url : definitions.get(node.identifier.toLowerCase())?.url
                const safeUrl = url ? defaultUrlTransform(url) : ''
                return inline(node.children, style).map(run => safeUrl ? { ...run, link: safeUrl, color: '#2563eb', decoration: 'underline' } : run)
            }
            if ('children' in node) {
                return inline(node.children, {
                    ...style,
                    ...(node.type === 'strong' ? { bold: true } : {}),
                    ...(node.type === 'emphasis' ? { italics: true } : {}),
                    ...(node.type === 'delete' ? { decoration: 'lineThrough' as const } : {}),
                })
            }
            return []
        })
    }
    function blocks(nodes: RootContent[]): Content[] {
        return nodes.flatMap((node): Content[] => {
            switch (node.type) {
                case 'paragraph': return [{ text: inline(node.children), margin: [0, 0, 0, 2] }]
                case 'heading': return [{ text: inline(node.children), bold: true, fontSize: Math.max(12, 20 - node.depth * 2), margin: [0, 6, 0, 5] }]
                case 'list': {
                    const items = node.children.map(item => ({ stack: [
                        ...(item.checked === null || item.checked === undefined ? [] : [{ text: item.checked ? '[x]' : '[ ]' }]),
                        ...blocks(item.children),
                    ] }))
                    return [node.ordered ? { ol: items, start: node.start ?? 1 } : { ul: items }]
                }
                case 'blockquote': return [{ stack: blocks(node.children), italics: true, color: '#4b5563', margin: [12, 4, 0, 4] }]
                case 'code': return [{ text: node.value, background: '#f3f4f6', margin: [0, 4, 0, 4] }]
                case 'html': return [{ text: node.value }]
                case 'thematicBreak': return [{ text: '────────────────────', color: '#9ca3af', margin: [0, 4, 0, 4] }]
                case 'table': return [{ table: { headerRows: 1, body: node.children.map((row, index) => row.children.map(cell => ({ text: inline(cell.children), bold: index === 0 }))) }, layout: 'lightHorizontalLines' }]
                default: return []
            }
        })
    }
    const content = blocks(root.children)
    return content.length ? content : [{ text: '' }]
}

function detail(label: string, value: string | null, markdown = true): Content[] {
    if (!value?.trim()) return []
    return [
        { text: label.toUpperCase(), style: 'sectionLabel', margin: [0, 7, 0, 2] },
        markdown ? { stack: markdownPdfContent(value.trim()), style: 'body' } : { text: value.trim(), style: 'body' },
    ]
}

function coverage(row: DropBagCoverageRow): Content[] {
    return [
        { text: row.label.toUpperCase(), style: 'sectionLabel', margin: [0, 5, 0, 2] },
        row.targetName ? { stack: [
            { text: row.targetName, bold: true },
            { text: [
                `Mile ${row.targetMile?.toFixed(1)} · +${row.milesUntil?.toFixed(1)} mi`,
                ...row.plans.filter(plan => plan.timeOfDay).map(plan => `     Arrival ${plan.timeOfDay}${plan.duration ? ` · in ${plan.duration}` : ''}`),
            ], style: 'redMetadata' },
        ], style: 'body' } : { text: 'None ahead', style: 'body' },
    ]
}

function bagItems(items: PrintableDropBag['items']): Content {
    if (!items.length) return { text: 'No items packed yet.', style: 'body' }
    const halfway = Math.ceil(items.length / 2)
    const list = (entries: PrintableDropBag['items']): Content => ({
        ul: entries.map(item => `${item.quantity?.trim() ? `${item.quantity.trim()} × ` : ''}${item.text}`),
        style: 'body',
    })
    return { columns: [list(items.slice(0, halfway)), list(items.slice(halfway))], columnGap: 18 }
}

export function buildDropBagListDefinition(raceName: string, planLabel: string | null, bags: PrintableDropBag[]): TDocumentDefinitions {
    const content: Content[] = []
    bags.forEach((bag, index) => {
        content.push({
            text: `${raceName} · Drop Bag List${planLabel ? ` · ${planLabel}` : ''}`,
            style: 'eyebrow',
            pageBreak: index > 0 ? 'before' : undefined,
        })
        content.push({ text: bag.stationName, style: 'bagTitle', margin: [0, 8, 0, 0] })
        if (bag.bagName && bag.bagName !== bag.stationName) {
            content.push({ text: bag.bagName, style: 'station', margin: [0, 2, 0, 0] })
        }
        const time = bag.arrival ? `${bag.mile === 0 ? 'Start time' : 'Arrival'} ${bag.arrival}` : null
        content.push({
            text: [`Mile ${bag.mile.toFixed(1)}`, time, bag.cutoff ? `Cutoff ${bag.cutoff}` : null].filter(Boolean).join('     '),
            style: 'redMetadata', margin: [0, 5, 0, 8],
        })
        content.push({ text: 'INSIDE THIS BAG', style: 'sectionLabel', margin: [0, 3, 0, 3] })
        content.push(bagItems(bag.items))
        if (bag.crewItems) {
            content.push({ columns: [
                { width: '45%', stack: [
                    { text: 'CREW GEAR', style: 'sectionLabel', margin: [0, 7, 0, 3] },
                    bag.crewItems.length
                        ? { ul: bag.crewItems.map(item => `${item.quantity?.trim() ? `${item.quantity.trim()} × ` : ''}${item.text}`), style: 'body' }
                        : { text: 'No crew gear planned yet.', style: 'body' },
                ] },
                { width: '55%', stack: detail('Crew notes', bag.crewNotes || 'No crew notes entered.') },
            ], columnGap: 14 })
        }
        bag.textFields.forEach(field => content.push(...detail(field.label, field.value || 'No text entered.')))
        content.push(...detail('Notes', bag.notes))
        content.push(...detail('Tell runner', bag.tellRunner))
        content.push(...detail('Next leg reminder', bag.nextLegReminder))
        bag.coverageRows.forEach(row => content.push(...coverage(row)))
    })

    return {
        pageSize: 'LETTER',
        pageMargins: [40, 34, 40, 34],
        info: { title: `${raceName} Drop Bag List` },
        content,
        defaultStyle: { font: 'Roboto', fontSize: 10, color: '#111827', lineHeight: 1.05 },
        styles: {
            eyebrow: { fontSize: 9, bold: true, color: '#6b7280' },
            bagTitle: { fontSize: 23, bold: true, color: '#111827' },
            station: { fontSize: 14, bold: true, color: '#374151' },
            redMetadata: { fontSize: 10, bold: true, color: '#b91c1c' },
            sectionLabel: { fontSize: 9, bold: true, color: '#374151' },
            body: { fontSize: 10, color: '#111827' },
        },
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
