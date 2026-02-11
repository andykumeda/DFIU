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

export interface HistoricalYear {
    year: number
    date: string  // YYYY-MM-DD of the actual date used
    high: number
    low: number
    precip: number
    conditions: string
}

export interface WeatherHistory {
    normals: {
        avg_high: number
        avg_low: number
        avg_precip: number
    } | null
    past_years: HistoricalYear[]
}

export interface FullWeatherResult {
    current: WeatherData
    history: WeatherHistory
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
    normal?: {
        tempmax: [number, number, number]  // [min, mean, max]
        tempmin: [number, number, number]
        precip: [number, number, number]
    }
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
 * Convert time string "HH:mm:ss" → "5:42 AM"
 */
function formatTime(isoTime: string): string {
    const [hours, minutes] = isoTime.split(':').map(Number)
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHour = hours % 12 || 12
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

/**
 * Fetch a single day's weather from Visual Crossing
 */
async function fetchDay(location: string, date: string): Promise<VisualCrossingResponse> {
    const url = `${BASE_URL}/${encodeURIComponent(location)}/${date}/${date}?unitGroup=us&key=${VISUAL_CROSSING_KEY}&include=days`
    const response = await fetch(url)
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Weather API error (${response.status}): ${text}`)
    }
    return response.json()
}

/**
 * Fetch weather data for a race — current forecast/stats + climate normals + past 3 years
 */
export async function fetchWeatherForRace(location: string, dateStr: string): Promise<FullWeatherResult> {
    if (!VISUAL_CROSSING_KEY) {
        throw new Error('Visual Crossing API key not configured. Add VITE_VISUAL_CROSSING_KEY to .env.local')
    }

    const raceDate = new Date(dateStr)
    const dateFormatted = raceDate.toISOString().split('T')[0]
    const month = raceDate.getMonth()
    const day = raceDate.getDate()
    const currentYear = new Date().getFullYear()
    const raceYear = raceDate.getFullYear()

    // Fetch current/forecast day (with normals)
    const currentUrl = `${BASE_URL}/${encodeURIComponent(location)}/${dateFormatted}/${dateFormatted}?unitGroup=us&key=${VISUAL_CROSSING_KEY}&include=days,normal`
    const currentResponse = await fetch(currentUrl)
    if (!currentResponse.ok) {
        const text = await currentResponse.text()
        throw new Error(`Weather API error (${currentResponse.status}): ${text}`)
    }
    const currentData: VisualCrossingResponse = await currentResponse.json()

    if (!currentData.days || currentData.days.length === 0) {
        throw new Error('No weather data returned for this location and date')
    }

    const todayData = currentData.days[0]

    // Extract climate normals from the response
    let normals: WeatherHistory['normals'] = null
    if (todayData.normal) {
        normals = {
            avg_high: Math.round(todayData.normal.tempmax[1]),  // mean value
            avg_low: Math.round(todayData.normal.tempmin[1]),
            avg_precip: Math.round(todayData.normal.precip[1] * 100) / 100
        }
    }

    // Fetch past 3 years — match the nearest same weekday
    const raceDayOfWeek = raceDate.getDay() // 0=Sun, 6=Sat
    const pastYears: number[] = []
    for (let i = 1; i <= 3; i++) {
        const year = raceYear - i
        if (year <= currentYear) {
            pastYears.push(year)
        }
    }

    const pastPromises = pastYears.map(async (year) => {
        try {
            // Start with the same calendar date in the past year
            const candidate = new Date(year, month, day)
            // Find the offset to the nearest same weekday (-3 to +3 days)
            let dayDiff = raceDayOfWeek - candidate.getDay()
            if (dayDiff > 3) dayDiff -= 7
            if (dayDiff < -3) dayDiff += 7
            candidate.setDate(candidate.getDate() + dayDiff)

            const pastDate = candidate.toISOString().split('T')[0]
            const data = await fetchDay(location, pastDate)
            if (data.days && data.days.length > 0) {
                const d = data.days[0]
                return {
                    year,
                    date: pastDate,
                    high: Math.round(d.tempmax),
                    low: Math.round(d.tempmin),
                    precip: Math.round(d.precip * 100) / 100,
                    conditions: d.conditions
                } as HistoricalYear
            }
            return null
        } catch {
            return null
        }
    })

    const pastResults = (await Promise.all(pastPromises)).filter(Boolean) as HistoricalYear[]
    pastResults.sort((a, b) => b.year - a.year)

    const current: WeatherData = {
        avg_temp_high: `${Math.round(todayData.tempmax)}°F`,
        avg_temp_low: `${Math.round(todayData.tempmin)}°F`,
        precip_chance: `${Math.round(todayData.precipprob)}%`,
        sunrise_time: formatTime(todayData.sunrise),
        sunset_time: formatTime(todayData.sunset),
        moon_phase: getMoonPhaseName(todayData.moonphase),
        weather_notes: todayData.conditions
    }

    return {
        current,
        history: {
            normals,
            past_years: pastResults
        }
    }
}
