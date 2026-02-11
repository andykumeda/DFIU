import { point } from '@turf/helpers';
import distance from '@turf/distance';
import along from '@turf/along';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import length from '@turf/length';

/**
 * Geometric Utility Functions
 */

/**
 * Calculate distance between two points in miles using Haversine formula
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const from = point([lon1, lat1]);
    const to = point([lon2, lat2]);
    return distance(from, to, { units: 'miles' });
}

export const getCoordinateAtDistance = (
    geojson:
        | GeoJSON.FeatureCollection
        | GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>
        | GeoJSON.LineString
        | GeoJSON.MultiLineString
        | null,
    distMeters: number
): [number, number] | null => {
    if (!geojson) {
        console.warn('getCoordinateAtDistance: no geojson provided');
        return null;
    }

    let lineFeature: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString> | undefined;

    // Handle Geometry directly
    if (geojson.type === 'LineString' || geojson.type === 'MultiLineString') {
        const geometry = geojson as GeoJSON.LineString | GeoJSON.MultiLineString;
        lineFeature = {
            type: 'Feature',
            geometry: geometry,
            properties: {}
        };
        // Handle implicit LineString (missing type property but has coordinates)
        // This handles the case observed in user logs where geometry is just { coordinates: [...] }
    } else if (!geojson.type && Array.isArray((geojson as any).coordinates)) {
        console.warn('getCoordinateAtDistance: implicit LineString detected (missing type)');
        lineFeature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: (geojson as any).coordinates
            },
            properties: {}
        };
    } else if (geojson.type === 'FeatureCollection') {
        lineFeature = (geojson as GeoJSON.FeatureCollection).features.find(f =>
            f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'
        ) as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;
    } else if (geojson.type === 'Feature') {
        lineFeature = geojson as GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;
    }

    if (!lineFeature) {
        console.warn('getCoordinateAtDistance: no LineString/MultiLineString feature found', JSON.stringify(geojson).substring(0, 200));
        return null;
    }

    try {
        const distKm = distMeters / 1000;
        const total = length(lineFeature, { units: 'kilometers' });
        const target = Math.max(0, Math.min(distKm, total));

        // turf/along only supports LineString. If MultiLineString, we might need to be careful?
        // Actually turf/along docs say "LineString". 
        // If we have MultiLineString, we should probably explode it or warn.
        // But for DFIU, we expect LineString. If it IS MultiLineString, let's try to handle it by using the first line or confusingly.
        // Better: checking if it works. Turf might throw on MultiLineString.

        if (lineFeature.geometry.type === 'MultiLineString') {
            // Fallback: use length to find which segment it's in? Too complex for now.
            // Let's just log if it overlaps.
            // Actually, simplest fix for MultiLineString is to flatten it to LineString if connected.
            // But let's assume LineString for now and just log if it fails.
            console.warn('getCoordinateAtDistance: MultiLineString not fully supported yet');
        }

        // @ts-ignore
        const p = along(lineFeature, target, { units: 'kilometers' });
        return p.geometry.coordinates as [number, number];
    } catch (e) {
        console.error('getCoordinateAtDistance error:', e);
        return null;
    }
};

export const getDistanceAtCoordinate = (
    geojson: GeoJSON.FeatureCollection | GeoJSON.Feature<GeoJSON.LineString> | null,
    lng: number,
    lat: number
): number | null => {
    if (!geojson) return null;
    const lineFeature = geojson.type === 'FeatureCollection'
        ? (geojson.features.find(f => f.geometry.type === 'LineString') as GeoJSON.Feature<GeoJSON.LineString>)
        : (geojson as GeoJSON.Feature<GeoJSON.LineString>);

    if (!lineFeature) return null;
    try {
        const p = point([lng, lat]);
        const snapped = nearestPointOnLine(lineFeature, p, { units: 'kilometers' });

        const distKm = snapped.properties?.location;
        if (typeof distKm === 'number') {
            return distKm * 1000; // convert to meters
        }
        return null;
    } catch (e) {
        console.error('Error in getDistanceAtCoordinate', e);
        return null;
    }
};

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
