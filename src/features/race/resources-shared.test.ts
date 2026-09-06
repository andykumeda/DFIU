import { describe, expect, it } from 'vitest'
import { normalizeResourceUrl } from './resources-shared'

describe('normalizeResourceUrl', () => {
    it('makes scheme-less resource URLs usable as external links', () => {
        expect(normalizeResourceUrl('www.example.com/guide')).toBe('https://www.example.com/guide')
        expect(normalizeResourceUrl(' example.com/guide ')).toBe('https://example.com/guide')
    })

    it('allows only web URLs', () => {
        expect(normalizeResourceUrl('https://example.com/guide')).toBe('https://example.com/guide')
        expect(normalizeResourceUrl('javascript:alert(1)')).toBeNull()
        expect(normalizeResourceUrl('not a URL')).toBeNull()
        expect(normalizeResourceUrl('')).toBeNull()
    })
})
