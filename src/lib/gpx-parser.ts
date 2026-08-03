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

// Distance-window smoothing before summation neutralizes elevation noise
// regardless of GPX point density. Window size depends on noise level:
// clean DEM-corrected StravaGPX exports use 60m; noisier wearable/race
// exports use 100m; DEM/route builders with residual jitter escalate to
// 400m + a small threshold. Validated against ground-truth:
//   Bay Area 100 (StravaGPX)   −1.6% (60m path)
//   Leona Divide (RubyGem)     −0.4%
//   Cocodona 250  (COROS)      +1.3%
//   Routesmith lap             ~+2.5% vs +3652 ft (400m+10ft)
//   StravaGPX Wilson Loop      ~aligned after escalate (was ~+200 ft)
const ELEVATION_WINDOW_CLEAN_M = 60
const ELEVATION_WINDOW_NOISY_M = 100
const ELEVATION_WINDOW_HEAVY_M = 400
const ELEVATION_HEAVY_THRESH_FT = 10
const ELEVATION_NOISE_RATIO_THRESHOLD = 1.10
// When 60m gain still exceeds a long-window gain by this factor, treat as
// residual high-frequency noise (dense StravaGPX / Routesmith DEM).
const ELEVATION_HEAVY_ESCALATE_RATIO = 1.05

function sumSmoothed(profile: { distance: number; elevation: number }[], windowM: number, threshFt = 0) {
    const half = (windowM / 1609.344) / 2
    const smoothed = new Array<number>(profile.length)
    let lo = 0, hi = 0, sum = 0
    for (let i = 0; i < profile.length; i++) {
        const t = profile[i].distance
        while (hi < profile.length && profile[hi].distance <= t + half) {
            sum += profile[hi].elevation
            hi++
        }
        while (lo < hi && profile[lo].distance < t - half) {
            sum -= profile[lo].elevation
            lo++
        }
        smoothed[i] = sum / Math.max(1, hi - lo)
    }
    let gainFt = 0, lossFt = 0
    let last = smoothed[0]
    for (let i = 1; i < smoothed.length; i++) {
        const d = smoothed[i] - last
        if (threshFt > 0 && Math.abs(d) < threshFt) continue
        if (d > 0) gainFt += d
        else if (d < 0) lossFt += -d
        last = smoothed[i]
    }
    return { gainFt, lossFt }
}

function computeElevationStatsFromProfile(
    profile: { distance: number; elevation: number }[]
): { gainFt: number; lossFt: number } {
    if (profile.length < 2) return { gainFt: 0, lossFt: 0 }

    // Estimate source noise: rawGain / 60m-smoothed gain. DEM-corrected
    // files sit near 1.03, noisier wearable/race exports near 1.4+.
    let rawGain = 0
    for (let i = 1; i < profile.length; i++) {
        const d = profile[i].elevation - profile[i - 1].elevation
        if (d > 0) rawGain += d
    }
    const clean = sumSmoothed(profile, ELEVATION_WINDOW_CLEAN_M)
    const heavy = sumSmoothed(profile, ELEVATION_WINDOW_HEAVY_M)
    // Residual high-frequency noise: light smoothing still above a long
    // window (dense StravaGPX ~+200 ft; Routesmith/DEM much higher).
    if (heavy.gainFt > 0 && clean.gainFt > heavy.gainFt * ELEVATION_HEAVY_ESCALATE_RATIO) {
        return sumSmoothed(profile, ELEVATION_WINDOW_HEAVY_M, ELEVATION_HEAVY_THRESH_FT)
    }
    const ratio = rawGain / Math.max(clean.gainFt, 1)
    if (ratio > ELEVATION_NOISE_RATIO_THRESHOLD) {
        return sumSmoothed(profile, ELEVATION_WINDOW_NOISY_M)
    }
    return clean
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

        // Accumulate distance to this point first so the profile entry below
        // carries the correct cumulative distance at point i.
        if (i > 0) {
            const prev = allPoints[i - 1]
            totalDistance += haversineDistance(prev.lat, prev.lon, point.lat, point.lon)
        }

        if (point.ele !== null && Number.isFinite(point.ele)) {
            const eleFt = metersToFeet(point.ele)
            if (Number.isFinite(eleFt)) {
                minEle = Math.min(minEle, eleFt)
                maxEle = Math.max(maxEle, eleFt)
            }
            elevationProfile.push({
                distance: totalDistance,
                elevation: eleFt
            })
        }
    }

    // Second pass: distance-window smooth elevationProfile then sum positive/negative deltas
    const { gainFt, lossFt } = computeElevationStatsFromProfile(elevationProfile)
    totalGain = gainFt
    totalLoss = lossFt

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
        name: gpxName || tracks.find(t => t.name)?.name || null,
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
