import { describe, expect, it } from 'vitest'
import { RACE_SELECT } from './race-select'
import { buildShareLink, createShareToken } from '../features/race/share-link'

describe('RACE_SELECT', () => {
  it('omits the share capability secret', () => {
    expect(RACE_SELECT.includes('public_share_token')).toBe(false)
    expect(RACE_SELECT.includes('public_share_enabled')).toBe(true)
    expect(RACE_SELECT.includes('id')).toBe(true)
  })
})

describe('share-link', () => {
  it('creates a non-empty token', () => {
    const token = createShareToken()
    expect(token.length).toBeGreaterThan(8)
  })

  it('builds a race share URL with the token query param', () => {
    const link = buildShareLink('race-123', 'token-abc')
    expect(link).toContain('/race/race-123?share=token-abc')
  })
})
