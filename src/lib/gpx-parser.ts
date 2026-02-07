/**
 * GPX Parser Utility
 * Parses GPX files and extracts route coordinates, elevation data, and statistics
 */

export interface GpxPoint {
    lat: number
    lon: number
    ele: number | null  // elevation in meters
    time?: string
}

export interface GpxTrack {
    name: string | null
    points: GpxPoint[]
}

export interface GpxParseResult {
    name: string | null
    tracks: GpxTrack[]
    bounds: {
        minLat: number
        maxLat: number
        minLon: number
        maxLon: number
    }
    stats: {
        totalDistanceMiles: number
        totalElevationGainFt: number
        totalElevationLossFt: number
        minElevationFt: number
        maxElevationFt: number
    }
    // Flattened points for easy mapping
    coordinates: [number, number][] // [lon, lat] for GeoJSON/Mapbox
    elevationProfile: { distance: number; elevation: number }[] // distance in miles, elevation in ft
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in miles
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8 // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

/**
 * Convert meters to feet
 */
function metersToFeet(meters: number): number {
    return meters * 3.28084
}

/**
 * Parse GPX XML string into structured data
 */
export function parseGpx(gpxString: string): GpxParseResult {
    const parser = new DOMParser()
    const doc = parser.parseFromString(gpxString, 'application/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
        throw new Error('Invalid GPX file: Unable to parse XML')
    }

    // Get GPX name
    const nameEl = doc.querySelector('gpx > metadata > name, gpx > name')
    const gpxName = nameEl?.textContent || null

    // Parse all tracks
    const tracks: GpxTrack[] = []
    const trkElements = doc.querySelectorAll('trk')

    if (trkElements.length === 0) {
        throw new Error('Invalid GPX file: No tracks found')
    }

    trkElements.forEach(trk => {
        const trackName = trk.querySelector('name')?.textContent || null
        const points: GpxPoint[] = []

        // Get all track points from all segments
        const trkpts = trk.querySelectorAll('trkseg > trkpt')
        trkpts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat') || '0')
            const lon = parseFloat(pt.getAttribute('lon') || '0')
            const eleEl = pt.querySelector('ele')
            const timeEl = pt.querySelector('time')

            points.push({
                lat,
                lon,
                ele: eleEl ? parseFloat(eleEl.textContent || '0') : null,
                time: timeEl?.textContent || undefined
            })
        })

        if (points.length > 0) {
            tracks.push({ name: trackName, points })
        }
    })

    if (tracks.length === 0 || tracks[0].points.length === 0) {
        throw new Error('Invalid GPX file: No track points found')
    }

    // Flatten all points for processing
    const allPoints = tracks.flatMap(t => t.points)

    // Calculate bounds
    const lats = allPoints.map(p => p.lat)
    const lons = allPoints.map(p => p.lon)
    const bounds = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons)
    }

    // Calculate statistics
    let totalDistance = 0
    let totalGain = 0
    let totalLoss = 0
    let minEle = Infinity
    let maxEle = -Infinity

    const coordinates: [number, number][] = []
    const elevationProfile: { distance: number; elevation: number }[] = []

    for (let i = 0; i < allPoints.length; i++) {
        const point = allPoints[i]

        // Add to coordinates array (lon, lat for GeoJSON)
        coordinates.push([point.lon, point.lat])

        // Track elevation extremes
        if (point.ele !== null) {
            const eleFt = metersToFeet(point.ele)
            minEle = Math.min(minEle, eleFt)
            maxEle = Math.max(maxEle, eleFt)

            // Add to elevation profile
            elevationProfile.push({
                distance: totalDistance,
                elevation: eleFt
            })
        }

        // Calculate distance and elevation change from previous point
        if (i > 0) {
            const prev = allPoints[i - 1]
            const dist = haversineDistance(prev.lat, prev.lon, point.lat, point.lon)
            totalDistance += dist

            if (point.ele !== null && prev.ele !== null) {
                const eleChangeMeters = point.ele - prev.ele

                // Only count change if it exceeds a noise threshold (e.g., 0.5 meters)
                // This prevents GPS jitter from inflating gain/loss, especially loss
                const THRESHOLD = 0.5

                if (Math.abs(eleChangeMeters) > THRESHOLD) {
                    const eleChangeFt = metersToFeet(eleChangeMeters)
                    if (eleChangeMeters > 0) {
                        totalGain += eleChangeFt
                    } else {
                        totalLoss += Math.abs(eleChangeFt)
                    }
                }
            }
        }
    }

    // Handle edge case where no elevation data exists
    if (minEle === Infinity) minEle = 0
    if (maxEle === -Infinity) maxEle = 0

    return {
        name: gpxName,
        tracks,
        bounds,
        stats: {
            totalDistanceMiles: Math.round(totalDistance * 100) / 100,
            totalElevationGainFt: Math.round(totalGain),
            totalElevationLossFt: Math.round(totalLoss),
            minElevationFt: Math.round(minEle),
            maxElevationFt: Math.round(maxEle)
        },
        coordinates,
        elevationProfile
    }
}

/**
 * Get the point at a specific mile marker along the route
 */
export function getPointAtMile(result: GpxParseResult, targetMile: number): { lat: number; lon: number; elevation: number | null } | null {
    const allPoints = result.tracks.flatMap(t => t.points)
    let cumulativeDistance = 0

    for (let i = 1; i < allPoints.length; i++) {
        const prev = allPoints[i - 1]
        const curr = allPoints[i]
        const segmentDist = haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon)

        if (cumulativeDistance + segmentDist >= targetMile) {
            // Interpolate position within this segment
            const ratio = (targetMile - cumulativeDistance) / segmentDist
            const lat = prev.lat + ratio * (curr.lat - prev.lat)
            const lon = prev.lon + ratio * (curr.lon - prev.lon)
            const elevation = prev.ele !== null && curr.ele !== null
                ? metersToFeet(prev.ele + ratio * (curr.ele - prev.ele))
                : null

            return { lat, lon, elevation }
        }

        cumulativeDistance += segmentDist
    }

    // If we're past the end, return the last point
    const lastPoint = allPoints[allPoints.length - 1]
    return {
        lat: lastPoint.lat,
        lon: lastPoint.lon,
        elevation: lastPoint.ele !== null ? metersToFeet(lastPoint.ele) : null
    }
}

/**
 * Sample elevation profile at regular intervals
 * Useful for chart display with many points
 */
export function sampleElevationProfile(
    profile: { distance: number; elevation: number }[],
    numSamples: number = 200
): { distance: number; elevation: number }[] {
    if (profile.length <= numSamples) return profile

    const result: { distance: number; elevation: number }[] = []
    const totalDistance = profile[profile.length - 1].distance
    const interval = totalDistance / (numSamples - 1)

    let profileIdx = 0
    for (let i = 0; i < numSamples; i++) {
        const targetDist = i * interval

        // Find the two points surrounding this distance
        while (profileIdx < profile.length - 1 && profile[profileIdx + 1].distance < targetDist) {
            profileIdx++
        }

        if (profileIdx >= profile.length - 1) {
            result.push(profile[profile.length - 1])
        } else {
            const p1 = profile[profileIdx]
            const p2 = profile[profileIdx + 1]
            const ratio = (targetDist - p1.distance) / (p2.distance - p1.distance)
            result.push({
                distance: targetDist,
                elevation: p1.elevation + ratio * (p2.elevation - p1.elevation)
            })
        }
    }

    return result
}
