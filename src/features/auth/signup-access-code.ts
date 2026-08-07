export const SIGNUP_ACCESS_CODE = '67'

export function isValidSignupAccessCode(code: string): boolean {
  return code.trim() === SIGNUP_ACCESS_CODE
}
