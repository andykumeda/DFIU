import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface CrewMapProps {
    coordinates: [number, number][]      // [lon, lat] tuples along course
    waypoints: {
        id: string
        name: string
        lat: number
        lon: number
        mile: number
        crew_allowed?: boolean | null
        bag_kind?: 'start' | 'official' | 'crew' | null
    }[]
    runnerLatLon?: [number, number] | null   // [lon, lat] predicted runner position
    crewLatLon?: [number, number] | null     // [lon, lat] crew current position
    nextWaypointId?: string | null
    className?: string
}

// Read-only mobile-friendly map for the crew view. Renders:
//   - course line
//   - waypoint pins (crew-accessible highlighted, saved bag points badged)
//   - runner predicted-position marker (animated dot)
//   - crew current-position marker (blue dot)
// Auto-fits to the runner and next aid station; crew location is shown without
// forcing the route to zoom out.
export function CrewMap({ coordinates, waypoints, runnerLatLon, crewLatLon, nextWaypointId, className }: CrewMapProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const runnerMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const crewMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const wpMarkersRef = useRef<mapboxgl.Marker[]>([])
    const styleLoadedRef = useRef(false)

    // Init once.
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return
        if (!import.meta.env.VITE_MAPBOX_TOKEN) {
            console.error('Mapbox token missing')
            return
        }
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

        const m = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/outdoors-v12',
            center: coordinates[0] ?? [-107.8, 37.9],
            zoom: 11,
            attributionControl: false,
        })
        mapRef.current = m

        m.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
        m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

        m.on('style.load', () => { styleLoadedRef.current = true })

        return () => {
            wpMarkersRef.current.forEach(mk => mk.remove())
            runnerMarkerRef.current?.remove()
            crewMarkerRef.current?.remove()
            m.remove()
            mapRef.current = null
            styleLoadedRef.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Course line + waypoint markers.
    useEffect(() => {
        const m = mapRef.current
        if (!m) return
        const draw = () => {
            if (!styleLoadedRef.current || coordinates.length === 0) return

            const sourceId = 'crew-course'
            const data: GeoJSON.Feature = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates },
            }
            const existing = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
            if (existing) {
                existing.setData(data)
            } else {
                m.addSource(sourceId, { type: 'geojson', data })
                m.addLayer({
                    id: 'crew-course-line',
                    type: 'line',
                    source: sourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.85 },
                })
            }

            wpMarkersRef.current.forEach(mk => mk.remove())
            wpMarkersRef.current = waypoints.map(wp => {
                const el = document.createElement('div')
                const isNext = wp.id === nextWaypointId
                const crew = !!wp.crew_allowed
                const hasBag = !!wp.bag_kind
                const isCrewBag = wp.bag_kind === 'crew'
                el.style.cssText = `
                    position:relative;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    width:${isNext ? 16 : 12}px;height:${isNext ? 16 : 12}px;
                    border-radius:50%;
                    background:${crew ? '#22c55e' : '#737373'};
                    border:${isNext ? '3px' : '2px'} solid #fff;
                    box-shadow:0 0 0 ${isNext ? '4px rgba(34,197,94,0.35)' : '2px rgba(0,0,0,0.4)'};
                `
                if (hasBag) {
                    const badge = document.createElement('div')
                    badge.textContent = isCrewBag ? '📦' : '🎒'
                    badge.style.cssText = `
                        position:absolute;
                        top:-11px;
                        right:-11px;
                        width:18px;
                        height:18px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        border-radius:999px;
                        background:${isCrewBag ? '#064e3b' : '#7c2d12'};
                        border:1.5px solid #fff;
                        box-shadow:0 1px 4px rgba(0,0,0,0.55);
                        font-size:11px;
                        line-height:1;
                    `
                    el.appendChild(badge)
                }
                const bagLabel = wp.bag_kind === 'crew'
                    ? 'crew bag'
                    : wp.bag_kind === 'start'
                        ? 'start gear'
                        : wp.bag_kind === 'official'
                            ? 'drop bag'
                            : ''
                el.title = `${wp.name} — mile ${wp.mile.toFixed(1)}${crew ? ' (crew)' : ''}${bagLabel ? ` · ${bagLabel}` : ''}`
                return new mapboxgl.Marker({ element: el }).setLngLat([wp.lon, wp.lat]).addTo(m)
            })
        }
        if (styleLoadedRef.current) draw()
        else m.once('style.load', draw)
    }, [coordinates, waypoints, nextWaypointId])

    // Runner marker.
    useEffect(() => {
        const m = mapRef.current
        if (!m) return
        if (!runnerLatLon) {
            runnerMarkerRef.current?.remove()
            runnerMarkerRef.current = null
            return
        }
        if (!runnerMarkerRef.current) {
            const el = document.createElement('div')
            el.style.cssText = `
                width:18px;height:18px;border-radius:50%;
                background:#ef4444;border:3px solid #fff;
                box-shadow:0 0 0 4px rgba(239,68,68,0.4);
            `
            el.title = 'Runner (predicted)'
            runnerMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(runnerLatLon).addTo(m)
        } else {
            runnerMarkerRef.current.setLngLat(runnerLatLon)
        }
    }, [runnerLatLon])

    // Crew marker.
    useEffect(() => {
        const m = mapRef.current
        if (!m) return
        if (!crewLatLon) {
            crewMarkerRef.current?.remove()
            crewMarkerRef.current = null
            return
        }
        if (!crewMarkerRef.current) {
            const el = document.createElement('div')
            el.style.cssText = `
                width:14px;height:14px;border-radius:50%;
                background:#0ea5e9;border:2px solid #fff;
                box-shadow:0 0 0 3px rgba(14,165,233,0.4);
            `
            el.title = 'You'
            crewMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(crewLatLon).addTo(m)
        } else {
            crewMarkerRef.current.setLngLat(crewLatLon)
        }
    }, [crewLatLon])

    // Auto-fit on runner + next waypoint (or whole course as fallback).
    useEffect(() => {
        const m = mapRef.current
        if (!m) return
        const fit = () => {
            const next = waypoints.find(w => w.id === nextWaypointId)
            const pts: [number, number][] = []
            if (runnerLatLon) pts.push(runnerLatLon)
            if (next) pts.push([next.lon, next.lat])
            if (pts.length >= 2) {
                const lons = pts.map(p => p[0])
                const lats = pts.map(p => p[1])
                m.fitBounds([
                    [Math.min(...lons), Math.min(...lats)],
                    [Math.max(...lons), Math.max(...lats)],
                ], { padding: 44, maxZoom: 15.5, duration: 600 })
                return
            }
            if (next) {
                m.easeTo({ center: [next.lon, next.lat], zoom: 13.5, duration: 600 })
                return
            }
            if (runnerLatLon) {
                m.easeTo({ center: runnerLatLon, zoom: 13.5, duration: 600 })
                return
            }
            if (coordinates.length > 0) {
                const lons = coordinates.map(c => c[0])
                const lats = coordinates.map(c => c[1])
                m.fitBounds([
                    [Math.min(...lons), Math.min(...lats)],
                    [Math.max(...lons), Math.max(...lats)],
                ], { padding: 32, maxZoom: 12, duration: 400 })
            }
        }
        if (styleLoadedRef.current) fit()
        else m.once('style.load', fit)
    }, [coordinates, waypoints, nextWaypointId, runnerLatLon])

    return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
