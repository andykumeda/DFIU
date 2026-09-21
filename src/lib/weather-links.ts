/** Public location query, without exposing the server-only weather API key. */
export function getWeatherLocationUrl(location: string | null | undefined): string {
    const url = new URL('https://www.visualcrossing.com/weather-query-builder/')
    if (location?.trim()) url.searchParams.set('location', location.trim())
    return url.toString()
}
