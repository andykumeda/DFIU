/**
 * Geometric Utility Functions
 */

// Helper to convert degrees to radians
function toRad(degrees: number): number {
    return degrees * Math.PI / 180;
}

/**
 * Calculate distance between two points in miles using Haversine formula
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Radius of Earth in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Find the nearest point on a polyline to a given point
 * Returns the nearest point coordinates, the index of the segment start, and the distance to the point
 */
export function getNearestPointOnLine(
    point: { lat: number; lon: number },
    line: [number, number][] // [lon, lat] pairs
): { lat: number; lon: number, distance: number, index: number } | null {
    if (!line || line.length < 2) return null;

    let minDistance = Infinity;
    let nearestPoint = { lat: 0, lon: 0 };
    let nearestIndex = 0;

    for (let i = 0; i < line.length - 1; i++) {
        const p1 = { lon: line[i][0], lat: line[i][1] };
        const p2 = { lon: line[i + 1][0], lat: line[i + 1][1] };

        // Project point onto line segment p1-p2
        // We use a simplified flat-earth approximation for projection factor t which is sufficient for short segments
        const dx = p2.lon - p1.lon;
        const dy = p2.lat - p1.lat;

        // Let P be the point, A=p1, B=p2. 
        // We want to find t such that A + t(B-A) is the projection of P onto AB
        // t = Dot(P-A, B-A) / |B-A|^2

        let t = ((point.lon - p1.lon) * dx + (point.lat - p1.lat) * dy) / (dx * dx + dy * dy);

        // Clamping t to segment [0, 1]
        t = Math.max(0, Math.min(1, t));

        const projectedLon = p1.lon + t * dx;
        const projectedLat = p1.lat + t * dy;

        const dist = getDistance(point.lat, point.lon, projectedLat, projectedLon);

        if (dist < minDistance) {
            minDistance = dist;
            nearestPoint = { lat: projectedLat, lon: projectedLon };
            nearestIndex = i;
        }
    }

    return { ...nearestPoint, distance: minDistance, index: nearestIndex };
}

/**
 * Calculate the cumulative distance along the path up to a specific point index
 */
export function getDistanceFromStart(line: [number, number][], index: number, pointOnSegment: { lat: number, lon: number }): number {
    let dist = 0;
    for (let i = 0; i < index; i++) {
        dist += getDistance(line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]);
    }

    // Add distance from segment start to the projected point
    dist += getDistance(line[index][1], line[index][0], pointOnSegment.lat, pointOnSegment.lon);

    return dist;
}
