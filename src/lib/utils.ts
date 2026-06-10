import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
