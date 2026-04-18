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
 * Optional mileHint helps choose the right visit in out-and-back or looping courses
 */
export function getNearestPointOnLine(
    pt: { lat: number; lon: number },
    line: [number, number][], // [lon, lat] pairs
    mileHint?: number
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

        // If no hint, use standard nearest point
        if (mileHint === undefined) {
            const snapped = nearestPointOnLine(lineFeature, p, { units: 'miles' });
            const [lon, lat] = snapped.geometry.coordinates;
            const dist = snapped.properties?.dist ?? Infinity;
            const index = snapped.properties?.index ?? 0;
            return { lat, lon, distance: dist, index };
        }

        // With hint: We want the point on the line that is close to the mouse AND close to the target mileage
        // Strategy: find segments where a point is geographically near the point,
        // then pick the one where cumulative distance is closest to mileHint.
        
        let bestCandidate: { lat: number; lon: number, distance: number, index: number } | null = null;
        let minMileDiff = Infinity;

        // Cumulative distances cache
        const cumDist: number[] = [0];
        for (let i = 0; i < line.length - 1; i++) {
            cumDist.push(cumDist[i] + getDistance(line[i][1], line[i][0], line[i+1][1], line[i+1][0]));
        }

        // Check every segment (simple and reliable for course lengths)
        for (let i = 0; i < line.length - 1; i++) {
            const segment = {
                type: 'Feature' as const,
                geometry: {
                    type: 'LineString' as const,
                    coordinates: [line[i], line[i + 1]]
                },
                properties: {}
            };
            const snapped = nearestPointOnLine(segment, p, { units: 'miles' });
            const dist = snapped.properties?.dist ?? Infinity;

            if (dist < 0.5) { // Threshold: 0.5 miles from route
                const [lon, lat] = snapped.geometry.coordinates;
                const distOnSegment = getDistance(line[i][1], line[i][0], lat, lon);
                const totalMile = cumDist[i] + distOnSegment;
                const mileDiff = Math.abs(totalMile - mileHint);

                if (mileDiff < minMileDiff) {
                    minMileDiff = mileDiff;
                    bestCandidate = { lat, lon, distance: dist, index: i };
                }
            }
        }

        return bestCandidate || getNearestPointOnLine(pt, line); // Fallback to standard
    } catch (e) {
        console.error('getNearestPointOnLine error:', e);
        return null;
    }
}

/**
 * Find every visit of the polyline to a point (out-and-back, loops, multi-lap).
 * A "visit" is a contiguous run of segments whose snap-distance is at or below
 * `thresholdMi`. Visits closer along the route than `minSeparationMi` are merged
 * (collapses GPS noise at the aid station itself into a single visit).
 */
export function getAllVisitsOnLine(
    pt: { lat: number; lon: number },
    line: [number, number][],
    thresholdMi: number = 0.1,
    minSeparationMi: number = 1.0
): { lat: number; lon: number; mile: number; distance: number }[] {
    if (!line || line.length < 2) return [];

    try {
        const p = point([pt.lon, pt.lat]);

        const cumDist: number[] = [0];
        for (let i = 0; i < line.length - 1; i++) {
            cumDist.push(cumDist[i] + getDistance(line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]));
        }

        type Visit = { lat: number; lon: number; mile: number; distance: number };
        const visits: Visit[] = [];
        let active: Visit | null = null;

        for (let i = 0; i < line.length - 1; i++) {
            const segment = {
                type: 'Feature' as const,
                geometry: { type: 'LineString' as const, coordinates: [line[i], line[i + 1]] },
                properties: {}
            };
            const snapped = nearestPointOnLine(segment, p, { units: 'miles' });
            const dist = snapped.properties?.dist ?? Infinity;

            if (dist <= thresholdMi) {
                const [lon, lat] = snapped.geometry.coordinates;
                const distOnSeg = getDistance(line[i][1], line[i][0], lat, lon);
                const mile = cumDist[i] + distOnSeg;
                if (!active || dist < active.distance) {
                    active = { lat, lon, mile, distance: dist };
                }
            } else if (active) {
                visits.push(active);
                active = null;
            }
        }
        if (active) visits.push(active);

        const merged: Visit[] = [];
        for (const v of visits) {
            const prev = merged[merged.length - 1];
            if (prev && v.mile - prev.mile < minSeparationMi) {
                if (v.distance < prev.distance) merged[merged.length - 1] = v;
            } else {
                merged.push(v);
            }
        }
        return merged;
    } catch (e) {
        console.error('getAllVisitsOnLine error:', e);
        return [];
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
