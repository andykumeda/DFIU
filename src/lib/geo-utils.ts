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
        // Handle implicit LineString (missing type but has coordinates array)
    } else if (!geojson.type && Array.isArray((geojson as any).coordinates)) {
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
        return null;
    }

    try {
        const distKm = distMeters / 1000;
        const total = length(lineFeature, { units: 'kilometers' });
        const target = Math.max(0, Math.min(distKm, total));

        // Note: turf/along only supports LineString; MultiLineString is not fully supported
        if (lineFeature.geometry.type === 'MultiLineString') {
            console.warn('getCoordinateAtDistance: MultiLineString not fully supported');
        }

        // @ts-expect-error - turf/along definition might vary
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
 * Uses turf's nearestPointOnLine for accurate geodesic projection
 * Returns the nearest point coordinates, the index of the segment start, and the distance to the point
 */
export function getNearestPointOnLine(
    pt: { lat: number; lon: number },
    line: [number, number][] // [lon, lat] pairs
): { lat: number; lon: number, distance: number, index: number } | null {
    if (!line || line.length < 2) return null;

    try {
        const lineFeature = {
            type: 'Feature' as const,
            properties: {},
            geometry: {
                type: 'LineString' as const,
                coordinates: line
            }
        };

        const p = point([pt.lon, pt.lat]);
        const snapped = nearestPointOnLine(lineFeature, p, { units: 'miles' });

        const [lon, lat] = snapped.geometry.coordinates;
        const dist = snapped.properties?.dist ?? Infinity;
        const index = snapped.properties?.index ?? 0;

        return { lat, lon, distance: dist, index };
    } catch (e) {
        console.error('getNearestPointOnLine error:', e);
        return null;
    }
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
