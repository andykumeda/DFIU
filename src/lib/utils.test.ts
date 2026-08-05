import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './utils'

describe('getErrorMessage', () => {
  it('returns the message of a native Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('returns a non-empty string as-is', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure')
  })

  it('reads message/code/hint off a Supabase PostgREST error object (not an Error instance)', () => {
    const postgrestError = {
      message: 'column races.official_revision does not exist',
      details: null,
      hint: null,
      code: '42703',
    }
    expect(postgrestError instanceof Error).toBe(false)
    expect(getErrorMessage(postgrestError)).toBe(
      'column races.official_revision does not exist (code 42703)',
    )
  })

  it('includes details and hint when present', () => {
    expect(
      getErrorMessage({ message: 'bad', details: 'extra detail', hint: 'try reload', code: 'PGRST204' }),
    ).toBe('bad extra detail Hint: try reload (code PGRST204)')
  })

  it('falls back to "Unknown error" for empty/opaque values', () => {
    expect(getErrorMessage(null)).toBe('Unknown error')
    expect(getErrorMessage(undefined)).toBe('Unknown error')
    expect(getErrorMessage({})).toBe('Unknown error')
  })
})
