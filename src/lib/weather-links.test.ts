import { describe, expect, it } from 'vitest'
import { getWeatherLocationUrl } from './weather-links'

describe('getWeatherLocationUrl', () => {
    it('opens the same named location without letting address characters become query parameters', () => {
        const location = '  Park & Ride, #2, Los Angeles, CA  '
        const url = new URL(getWeatherLocationUrl(location))
        expect(url.origin).toBe('https://www.visualcrossing.com')
        expect(url.pathname).toBe('/weather-query-builder/')
        expect([...url.searchParams]).toEqual([['location', location.trim()]])
        expect(url.hash).toBe('')
    })

    it('preserves saved aid-station coordinates', () => {
        expect(new URL(getWeatherLocationUrl('34.25800,-118.10400')).searchParams.get('location')).toBe('34.25800,-118.10400')
    })

    it('opens the public builder when no location is available', () => {
        for (const location of [null, undefined, '   ']) {
            expect(getWeatherLocationUrl(location)).toBe('https://www.visualcrossing.com/weather-query-builder/')
        }
    })
})
