import { describe, expect, it } from 'vitest'
import { getWeatherLocationUrl } from './weather-links'

describe('getWeatherLocationUrl', () => {
    it('opens the public National Weather Service forecast for race coordinates', () => {
        const location = '  Park & Ride, #2, Los Angeles, CA  '
        const url = new URL(getWeatherLocationUrl(location, 34.201, -118.114))
        expect(url.origin).toBe('https://forecast.weather.gov')
        expect(url.pathname).toBe('/MapClick.php')
        expect(url.searchParams.get('lat')).toBe('34.201')
        expect(url.searchParams.get('lon')).toBe('-118.114')
        expect(url.hash).toBe('')
    })

    it('uses coordinates stored as a location string when explicit coordinates are unavailable', () => {
        const url = new URL(getWeatherLocationUrl('34.25800,-118.10400'))
        expect(url.pathname).toBe('/MapClick.php')
        expect(url.searchParams.get('lat')).toBe('34.258')
        expect(url.searchParams.get('lon')).toBe('-118.104')
    })

    it('opens the public NWS forecast search when only a named location is available', () => {
        const url = new URL(getWeatherLocationUrl('Altadena, CA'))
        expect(url.origin).toBe('https://forecast.weather.gov')
        expect(url.pathname).toBe('/zipcity.php')
        expect(url.searchParams.get('inputstring')).toBe('Altadena, CA')
    })

    it('opens the public NWS forecast page when no location is available', () => {
        for (const location of [null, undefined, '   ']) {
            expect(getWeatherLocationUrl(location)).toBe('https://www.weather.gov/forecast/')
        }
    })
})
