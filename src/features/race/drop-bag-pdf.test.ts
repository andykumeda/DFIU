import { describe, expect, it } from 'vitest'
import { buildDropBagListDefinition, markdownPdfContent } from './drop-bag-pdf'

describe('drop bag PDF markdown', () => {
    it('formats the reported crew notes with bold text and real list items', () => {
        expect(markdownPdfContent('**Take headlamp and poles**\n* Bucket with water\n* Gatorade')).toEqual([
            { text: [{ text: 'Take headlamp and poles', bold: true }], margin: [0, 0, 0, 2] },
            { ul: [
                { stack: [{ text: [{ text: 'Bucket with water' }], margin: [0, 0, 0, 2] }] },
                { stack: [{ text: [{ text: 'Gatorade' }], margin: [0, 0, 0, 2] }] },
            ] },
        ])
    })

    it('generates a PDF containing rich text blocks', async () => {
        const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
            import('pdfmake/build/pdfmake.js'),
            import('pdfmake/build/vfs_fonts.js'),
        ])
        const result = await new Promise<Uint8Array>(resolve => {
            pdfMake.createPdf({ content: markdownPdfContent('# Crew\n\n**Headlamp** and *poles*\n\n* Water\n* Fuel\n\n[Map](https://example.com)') }, undefined, undefined, fonts).getBuffer(resolve)
        })
        expect(new TextDecoder().decode(result.slice(0, 5))).toBe('%PDF-')
        expect(result.length).toBeGreaterThan(1000)
    })

    it('preserves plain text and newlines', () => {
        expect(markdownPdfContent('First line\nSecond line')).toEqual([
            { text: [{ text: 'First line\nSecond line' }], margin: [0, 0, 0, 2] },
        ])
    })

    it('renders nested emphasis and safe clickable links', () => {
        const output = JSON.stringify(markdownPdfContent('***Important*** [Map](https://example.com) [unsafe](javascript:alert)'))
        expect(output).toContain('"bold":true')
        expect(output).toContain('"italics":true')
        expect(output).toContain('"link":"https://example.com"')
        expect(output).not.toContain('javascript:')
        expect(output).toContain('unsafe')
    })

    it('keeps headings, numbered lists, GFM tables and strikethrough', () => {
        const content = markdownPdfContent('# Supplies\n\n3. ~~Old~~\n4. New\n\n| Item | Qty |\n| --- | --- |\n| Water | 2 |')
        expect(content[0]).toMatchObject({ bold: true, fontSize: 18 })
        expect(content[1]).toMatchObject({ start: 3, ol: expect.any(Array) })
        expect(content[2]).toMatchObject({ table: { headerRows: 1, body: expect.any(Array) } })
        expect(JSON.stringify(content)).toContain('lineThrough')
    })

    it('lays out a bag with station-first headings, compact columns, red times, and plain crew bullets', () => {
        const definition = buildDropBagListDefinition('Race', 'Plan A', [{
            stationName: 'Redbox', bagName: 'Black Duffel', mile: 24.6, arrival: '11:21', cutoff: '12:25',
            items: [{ text: 'Chews' }, { text: 'Bottle' }, { text: 'Socks' }],
            crewItems: [{ text: 'Bucket', checked: false }], crewNotes: '* Fill the bottle',
            textFields: [], notes: null, tellRunner: null, nextLegReminder: null,
            coverageRows: [{ label: 'Next aid', labelClass: '', targetName: 'Newcomb Saddle', targetMile: 33.2, milesUntil: 8.6,
                plans: [{ label: 'Plan A', colorClass: '', timeOfDay: '13:05', duration: '1h 44m' }] }],
        }])
        const output = JSON.stringify(definition)
        expect(definition.footer).toBeUndefined()
        expect(output).toContain('"text":"Redbox","style":"bagTitle"')
        expect(output).toContain('"text":"Black Duffel","style":"station"')
        expect(output).toContain('"style":"redMetadata"')
        expect(output).toContain('"columns"')
        expect(output).toContain('"ul":["Bucket"]')
        expect(output).not.toContain('[ ]')
        expect(output).not.toContain('To pack')
    })
})
