/** Public no-login forecast page, without exposing the server-only weather API key. */
export function getWeatherLocationUrl(
    location: string | null | undefined,
    latitude?: number | null,
    longitude?: number | null,
): string {
    let lat = latitude
    let lon = longitude
    const trimmed = location?.trim() ?? ''
    const coordinateMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && coordinateMatch) {
        lat = Number(coordinateMatch[1])
        lon = Number(coordinateMatch[2])
    }
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const url = new URL('https://forecast.weather.gov/MapClick.php')
        url.searchParams.set('lat', String(Number(lat)))
        url.searchParams.set('lon', String(Number(lon)))
        return url.toString()
    }
    if (trimmed) {
        const url = new URL('https://forecast.weather.gov/zipcity.php')
        url.searchParams.set('inputstring', trimmed)
        return url.toString()
    }
    return 'https://www.weather.gov/forecast/'
}
