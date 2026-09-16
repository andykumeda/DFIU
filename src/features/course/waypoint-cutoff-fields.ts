export interface WaypointCutoffFields {
    date: string
    time: string
}

export const isValidHtmlTimeValue = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

export function normalizeWaypointCutoffInput(value: string): string | null {
    const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/)
    if (!match) return null

    const normalized = `${match[1].padStart(2, '0')}:${match[2]}`
    return isValidHtmlTimeValue(normalized) ? normalized : null
}

export function formatWaypointCutoffFields(
    cutoffTime: string | null | undefined,
    timeZone: string | undefined,
    formatToParts: (date: Date) => Intl.DateTimeFormatPart[] = date => new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
    }).formatToParts(date),
): WaypointCutoffFields {
    if (!cutoffTime || !timeZone) return { date: '', time: '' }

    const cutoffDate = new Date(cutoffTime)
    if (Number.isNaN(cutoffDate.getTime())) return { date: '', time: '' }

    try {
        const parts = formatToParts(cutoffDate)
        const year = parts.find(part => part.type === 'year')?.value
        const month = parts.find(part => part.type === 'month')?.value
        const day = parts.find(part => part.type === 'day')?.value
        const formattedHour = parts.find(part => part.type === 'hour')?.value
        const minute = parts.find(part => part.type === 'minute')?.value
        const hour = formattedHour === '24' ? '00' : formattedHour
        const hasValidTime = hour !== undefined
            && minute !== undefined
            && isValidHtmlTimeValue(`${hour}:${minute}`)

        return {
            date: year && month && day ? `${year}-${month}-${day}` : '',
            time: hasValidTime ? `${hour}:${minute}` : '',
        }
    } catch {
        return { date: '', time: '' }
    }
}
