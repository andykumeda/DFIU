import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a human-readable message from an unknown thrown value.
 * Handles native Errors, plain strings, and Supabase/PostgREST error objects
 * (which are plain objects carrying `message`/`details`/`hint`/`code`, not
 * `Error` instances). Falling back to `error instanceof Error` alone renders
 * every PostgREST failure as an opaque "Unknown error".
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts: string[] = []
    if (typeof e.message === 'string' && e.message) parts.push(e.message)
    if (typeof e.details === 'string' && e.details && e.details !== e.message) parts.push(e.details)
    if (typeof e.hint === 'string' && e.hint) parts.push(`Hint: ${e.hint}`)
    if (typeof e.code === 'string' && e.code) parts.push(`(code ${e.code})`)
    if (parts.length) return parts.join(' ')
  }
  return 'Unknown error'
}

export function formatDate(date: string | null | undefined, formatStr: string = 'PPP'): string {
  if (!date) return ''
  try {
    return format(new Date(date), formatStr)
  } catch {
    return ''
  }
}

export function formatStoredClockTime(value: string | null | undefined, clock24h: boolean): string {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  if (trimmed === '--') return trimmed

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i)
  if (!match) return trimmed

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]?.toUpperCase()

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return trimmed
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) return trimmed
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0)
  } else if (hours < 0 || hours > 23) {
    return trimmed
  }

  const paddedMinutes = minutes.toString().padStart(2, '0')
  if (clock24h) return `${hours.toString().padStart(2, '0')}:${paddedMinutes}`

  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${paddedMinutes} ${suffix}`
}
