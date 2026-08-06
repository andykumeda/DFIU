import { describe, expect, it } from 'vitest'
import { RACE_SELECT } from './race-select'
import {
  buildShareLink,
  createShareToken,
  getShareTokenFromUrl,
  isRaceUuid,
  isShareLinkView,
  normalizeShareAlias,
  validateShareAlias,
} from '../features/race/share-link'

describe('RACE_SELECT', () => {
  it('omits the share capability secret', () => {
    expect(RACE_SELECT.includes('public_share_token')).toBe(false)
    expect(RACE_SELECT.includes('public_share_enabled')).toBe(true)
    expect(RACE_SELECT.includes('public_share_alias')).toBe(true)
    expect(RACE_SELECT.includes('id')).toBe(true)
  })

  it('includes official merge revision columns', () => {
    expect(RACE_SELECT.includes('official_revision')).toBe(true)
    expect(RACE_SELECT.includes('merged_official_revision')).toBe(true)
  })
})

describe('share-link', () => {
  it('creates a non-empty token', () => {
    const token = createShareToken()
    expect(token.length).toBeGreaterThan(8)
  })

  it('builds a short share URL without /race/', () => {
    const link = buildShareLink('race-123', 'token-abc')
    expect(link).toContain('/race-123?share=token-abc')
    expect(link).not.toContain('/race/race-123')
  })

  it('prefers a vanity alias in the share URL', () => {
    const link = buildShareLink('race-123', 'token-abc', 'ac100')
    expect(link).toContain('/ac100?share=token-abc')
  })

  it('reads the share token from short and legacy race URLs', () => {
    expect(getShareTokenFromUrl('https://dfiu.app/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?share=tok')).toBe('tok')
    expect(getShareTokenFromUrl('https://dfiu.app/ac100?share=tok')).toBe('tok')
    expect(getShareTokenFromUrl('https://dfiu.app/race/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?share=tok')).toBe('tok')
    expect(getShareTokenFromUrl('https://dfiu.app/events?share=tok')).toBeNull()
    expect(isShareLinkView('https://dfiu.app/ac100?share=tok')).toBe(true)
    expect(isShareLinkView('https://dfiu.app/ac100')).toBe(false)
  })

  it('validates vanity aliases', () => {
    expect(normalizeShareAlias('  AC100 ')).toBe('ac100')
    expect(validateShareAlias('')).toEqual({ ok: true, alias: null })
    expect(validateShareAlias('ac100').ok).toBe(true)
    expect(validateShareAlias('login').ok).toBe(false)
    expect(validateShareAlias('ab').ok).toBe(false)
    expect(isRaceUuid('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(true)
  })
})
