import { describe, expect, it } from 'vitest'
import { markdownPdfContent } from './drop-bag-pdf'

describe('drop bag PDF markdown', () => {
    it('formats the reported crew notes with bold text and real list items', () => {
        expect(markdownPdfContent('**Take headlamp and poles**\n* Bucket with water\n* Gatorade')).toEqual([
            { text: [{ text: 'Take headlamp and poles', bold: true }], margin: [0, 0, 0, 5] },
            { ul: [
                { stack: [{ text: [{ text: 'Bucket with water' }], margin: [0, 0, 0, 5] }] },
                { stack: [{ text: [{ text: 'Gatorade' }], margin: [0, 0, 0, 5] }] },
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
            { text: [{ text: 'First line\nSecond line' }], margin: [0, 0, 0, 5] },
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
})
