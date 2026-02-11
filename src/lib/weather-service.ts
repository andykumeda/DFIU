/**
 * Weather Service
 * Fetches weather data from Visual Crossing Timeline API
 */

const VISUAL_CROSSING_KEY = import.meta.env.VITE_VISUAL_CROSSING_KEY
const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline'

export interface WeatherData {
    avg_temp_high: string
    avg_temp_low: string
    precip_chance: string
    sunrise_time: string
    sunset_time: string
    moon_phase: string
    weather_notes: string
}

interface VisualCrossingDay {
    tempmax: number
    tempmin: number
    precip: number
    precipprob: number
    sunrise: string
    sunset: string
    moonphase: number
    conditions: string
    description: string
    humidity: number
    windspeed: number
    uvindex: number
}

interface VisualCrossingResponse {
    days: VisualCrossingDay[]
    resolvedAddress: string
}

/**
 * Convert moon phase fraction (0-1) to human-readable name
 */
function getMoonPhaseName(phase: number): string {
    if (phase === 0 || phase === 1) return '🌑 New Moon'
    if (phase < 0.25) return '🌒 Waxing Crescent'
    if (phase === 0.25) return '🌓 First Quarter'
    if (phase < 0.5) return '🌔 Waxing Gibbous'
    if (phase === 0.5) return '🌕 Full Moon'
    if (phase < 0.75) return '🌖 Waning Gibbous'
    if (phase === 0.75) return '🌗 Last Quarter'
    return '🌘 Waning Crescent'
}

/**
 * Convert ISO time string to readable format (e.g. "05:42:00" → "5:42 AM")
 */
function formatTime(isoTime: string): string {
    // Visual Crossing returns time as "HH:mm:ss"
    const [hours, minutes] = isoTime.split(':').map(Number)
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHour = hours % 12 || 12
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

/**
 * Fetch weather data for a race location and date
 */
export async function fetchWeatherForRace(location: string, dateStr: string): Promise<WeatherData> {
    if (!VISUAL_CROSSING_KEY) {
        throw new Error('Visual Crossing API key not configured. Add VITE_VISUAL_CROSSING_KEY to .env.local')
    }

    // Parse the date to YYYY-MM-DD format
    const date = new Date(dateStr)
    const dateFormatted = date.toISOString().split('T')[0]

    const url = `${BASE_URL}/${encodeURIComponent(location)}/${dateFormatted}/${dateFormatted}?unitGroup=us&key=${VISUAL_CROSSING_KEY}&include=days`

    const response = await fetch(url)

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Weather API error (${response.status}): ${text}`)
    }

    const data: VisualCrossingResponse = await response.json()

    if (!data.days || data.days.length === 0) {
        throw new Error('No weather data returned for this location and date')
    }

    const day = data.days[0]

    return {
        avg_temp_high: `${Math.round(day.tempmax)}°F`,
        avg_temp_low: `${Math.round(day.tempmin)}°F`,
        precip_chance: `${Math.round(day.precipprob)}%`,
        sunrise_time: formatTime(day.sunrise),
        sunset_time: formatTime(day.sunset),
        moon_phase: getMoonPhaseName(day.moonphase),
        weather_notes: day.conditions
    }
}
