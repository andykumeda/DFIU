/** Accept both legacy HH:MM values and timestamp cutoffs, in the race timezone. */
export function formatBagCutoff(value: string | null, timezone: string | null, clock24h: boolean): string | null {
    if (!value) return null
    const clock = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
    const date = clock ? new Date(`2000-01-01T${clock[1]}:${clock[2]}:00Z`) : new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: !clock24h, timeZone: clock ? 'UTC' : timezone || undefined })
}
