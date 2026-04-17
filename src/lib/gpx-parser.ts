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

export interface GpxWaypoint {
    name: string
    lat: number
    lon: number
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
    waypoints: GpxWaypoint[] // parsed <wpt> elements
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
 * Compute elevation gain and loss using hysteresis.
 *
 * Counts gain only after a cumulative rise of >= minGainM above the last low
 * point, and loss only after a cumulative drop of >= minGainM below the last
 * high point. This is recording-density-agnostic: it works correctly whether
 * the GPS logged points every 5m or every 50m.
 *
 * The previous moving-average approach used a fixed point-count window (7
 * points), which over-smoothed sparse tracks (e.g. Garmin smart recording at
 * ~50m intervals), causing ~1000ft of under-counting on a 50-mile race.
 */
function computeElevationStats(
    elevations: (number | null)[],
    minGainM: number = 5.0
): { gain: number; loss: number } {
    const valid = elevations.filter((e): e is number => e !== null && Number.isFinite(e))
    if (valid.length < 2) return { gain: 0, loss: 0 }

    let gain = 0
    let loss = 0
    // Track low/high water marks independently for gain and loss
    let gainLow = valid[0]   // lowest point since last gain was counted
    let lossHigh = valid[0]  // highest point since last loss was counted

    for (let i = 1; i < valid.length; i++) {
        const e = valid[i]

        // Gain: count when we've risen >= minGainM above the last low
        if (e < gainLow) {
            gainLow = e
        } else if (e - gainLow >= minGainM) {
            gain += e - gainLow
            gainLow = e
        }

        // Loss: count when we've dropped >= minGainM below the last high
        if (e > lossHigh) {
            lossHigh = e
        } else if (lossHigh - e >= minGainM) {
            loss += lossHigh - e
            lossHigh = e
        }
    }

    return { gain, loss }
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

    // First pass: collect coordinates, distances, elevation profile, and raw elevations
    for (let i = 0; i < allPoints.length; i++) {
        const point = allPoints[i]

        // Add to coordinates array (lon, lat for GeoJSON)
        coordinates.push([point.lon, point.lat])

        // Track elevation extremes
        if (point.ele !== null && Number.isFinite(point.ele)) {
            const eleFt = metersToFeet(point.ele)

            // Only update extremes if valid
            if (Number.isFinite(eleFt)) {
                minEle = Math.min(minEle, eleFt)
                maxEle = Math.max(maxEle, eleFt)
            }

            // Add to elevation profile (raw values for chart fidelity)
            elevationProfile.push({
                distance: totalDistance,
                elevation: eleFt
            })
        }

        // Accumulate distance
        if (i > 0) {
            const prev = allPoints[i - 1]
            const dist = haversineDistance(prev.lat, prev.lon, point.lat, point.lon)
            totalDistance += dist
        }
    }

    // Second pass: compute gain/loss using hysteresis (density-agnostic)
    const rawElevations = allPoints.map(p => p.ele)
    const { gain, loss } = computeElevationStats(rawElevations)
    totalGain = metersToFeet(gain)
    totalLoss = metersToFeet(loss)

    // Handle edge case where no elevation data exists
    if (minEle === Infinity) minEle = 0
    if (maxEle === -Infinity) maxEle = 0

    // Final safety check for NaNs
    const safeTotalDistance = Number.isFinite(totalDistance) ? totalDistance : 0
    const safeTotalGain = Number.isFinite(totalGain) ? totalGain : 0
    const safeTotalLoss = Number.isFinite(totalLoss) ? totalLoss : 0
    const safeMinEle = Number.isFinite(minEle) ? minEle : 0
    const safeMaxEle = Number.isFinite(maxEle) ? maxEle : 0

    // If profile is massive (e.g. > 10000 points), sample it down to save DB space/bandwidth
    // A 100-mile race with 10m intervals is ~16k points. 250 miles is ~40k.
    // Keeping it under 5000 is plenty for a high-res chart unless we need meter-perfect precision for something else.
    const optimizedProfile = elevationProfile.length > 5000
        ? sampleElevationProfile(elevationProfile, 5000)
        : elevationProfile

    // Parse top-level <wpt> elements
    const gpxWaypoints: GpxWaypoint[] = []
    const wptElements = doc.querySelectorAll('gpx > wpt')
    let wptIndex = 1
    wptElements.forEach(wpt => {
        const lat = parseFloat(wpt.getAttribute('lat') || '0')
        const lon = parseFloat(wpt.getAttribute('lon') || '0')
        const nameEl = wpt.querySelector('name')
        const name = nameEl?.textContent?.trim() || `Aid Station ${wptIndex}`
        gpxWaypoints.push({ name, lat, lon })
        wptIndex++
    })

    return {
        name: gpxName,
        tracks,
        bounds,
        stats: {
            totalDistanceMiles: Math.round(safeTotalDistance * 100) / 100,
            totalElevationGainFt: Math.round(safeTotalGain),
            totalElevationLossFt: Math.round(safeTotalLoss),
            minElevationFt: Math.round(safeMinEle),
            maxElevationFt: Math.round(safeMaxEle)
        },
        coordinates,
        elevationProfile: optimizedProfile,
        waypoints: gpxWaypoints
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
    if (!profile || profile.length === 0) return []
    if (profile.length <= numSamples) return profile

    // Filter out invalid points first
    const validProfile = profile.filter(p => Number.isFinite(p.distance) && Number.isFinite(p.elevation))
    if (validProfile.length === 0) return []
    if (validProfile.length <= numSamples) return validProfile

    const result: { distance: number; elevation: number }[] = []
    const totalDistance = validProfile[validProfile.length - 1].distance
    const interval = totalDistance / (numSamples - 1)

    let profileIdx = 0
    for (let i = 0; i < numSamples; i++) {
        const targetDist = i * interval

        // Find the two points surrounding this distance
        while (profileIdx < validProfile.length - 1 && validProfile[profileIdx + 1].distance < targetDist) {
            profileIdx++
        }

        if (profileIdx >= validProfile.length - 1) {
            result.push(validProfile[validProfile.length - 1])
        } else {
            const p1 = validProfile[profileIdx]
            const p2 = validProfile[profileIdx + 1]
            const ratio = (targetDist - p1.distance) / (p2.distance - p1.distance)

            // Safety check for NaN
            const ele = p1.elevation + ratio * (p2.elevation - p1.elevation)
            result.push({
                distance: targetDist,
                elevation: Number.isFinite(ele) ? ele : p1.elevation
            })
        }
    }

    return result
}
