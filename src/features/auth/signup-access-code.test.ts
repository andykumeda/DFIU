import { describe, expect, it } from 'vitest'
import { isValidSignupAccessCode } from './signup-access-code'

describe('signup access code', () => {
  it('accepts the default code with surrounding whitespace', () => {
    expect(isValidSignupAccessCode(' 67 ')).toBe(true)
  })

  it('rejects other codes', () => {
    expect(isValidSignupAccessCode('68')).toBe(false)
    expect(isValidSignupAccessCode('')).toBe(false)
  })
})
