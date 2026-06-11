import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

import { getDistance, getCoordinateAtDistance } from '@/lib/geo-utils'
import styles from '@/features/course/CourseMap.module.css'
import type { BagKind } from './drop-bag-shared'

type CrewWaypoint = {
    id: string
    name: string
    lat: number
    lon: number
    mile: number
    type: string
    has_drop_bag?: boolean | null
    crew_allowed?: boolean | null
    pacer_allowed?: boolean | null
    bag_kind?: BagKind | null
}

interface CrewMapProps {
    coordinates: [number, number][]
    waypoints: CrewWaypoint[]
    runnerLatLon?: [number, number] | null
    crewLatLon?: [number, number] | null
    nextWaypointId?: string | null
    focusStartMile?: number | null
    focusEndMile?: number | null
    className?: string
}

// Read-only Crew map. Aid-station markers intentionally mirror CourseMap so
// Crew View and Map & Aid Stations show the same station placement/appearance.
export function CrewMap({
    coordinates,
    waypoints,
    runnerLatLon,
    crewLatLon,
    nextWaypointId,
    focusStartMile,
    focusEndMile,
    className,
}: CrewMapProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<mapboxgl.Map | null>(null)
    const runnerMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const crewMarkerRef = useRef<mapboxgl.Marker | null>(null)
    const wpMarkersRef = useRef<mapboxgl.Marker[]>([])
    const styleLoadedRef = useRef(false)

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return
        if (!import.meta.env.VITE_MAPBOX_TOKEN) {
            console.error('Mapbox token missing')
            return
        }
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

        const map = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/outdoors-v12',
            center: coordinates[0] ?? [-107.8, 37.9],
            zoom: 11,
            attributionControl: false,
        })
        mapRef.current = map

        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
        map.addControl(new mapboxgl.NavigationControl(), 'top-right')
        map.on('style.load', () => { styleLoadedRef.current = true })

        return () => {
            wpMarkersRef.current.forEach(marker => marker.remove())
            runnerMarkerRef.current?.remove()
            crewMarkerRef.current?.remove()
            map.remove()
            mapRef.current = null
            styleLoadedRef.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        const drawRouteAndWaypoints = () => {
            if (!styleLoadedRef.current || coordinates.length === 0) return

            const routeData: GeoJSON.Feature<GeoJSON.LineString> = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates },
            }

            const source = map.getSource('route') as mapboxgl.GeoJSONSource | undefined
            if (source) {
                source.setData(routeData)
            } else {
                map.addSource('route', { type: 'geojson', data: routeData })
                map.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#e11d48', 'line-width': 4 },
                })
            }

            wpMarkersRef.current.forEach(marker => marker.remove())
            wpMarkersRef.current = []

            const groups = groupWaypoints(waypoints)
            groups.forEach(group => {
                group.sort((a, b) => a.mile - b.mile)
                const primary = group[0]
                const markerEl = createWaypointMarker(group, nextWaypointId)
                const marker = new mapboxgl.Marker({
                    element: markerEl,
                    draggable: false,
                    anchor: 'center',
                    offset: [0, 0],
                })
                    .setLngLat([primary.lon, primary.lat])
                    .addTo(map)

                if (group.length > 1) {
                    markerEl.addEventListener('click', event => {
                        event.stopPropagation()
                        const popupDiv = document.createElement('div')
                        popupDiv.className = 'p-2 min-w-[160px]'
                        popupDiv.innerHTML = '<div class="text-[10px] font-bold text-neutral-400 uppercase mb-2 tracking-wider">Aid Station Visits</div>'

                        const list = document.createElement('div')
                        list.className = 'flex flex-col gap-1'
                        group.forEach(wp => {
                            const row = document.createElement('div')
                            row.className = 'text-sm py-2 px-2 rounded flex justify-between items-center w-full'

                            const name = document.createElement('span')
                            name.className = 'font-medium text-neutral-700'
                            name.textContent = wp.name
                            row.appendChild(name)

                            const mile = document.createElement('span')
                            mile.className = 'text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded'
                            mile.textContent = `Mi ${wp.mile.toFixed(1)}`
                            row.appendChild(mile)
                            list.appendChild(row)
                        })
                        popupDiv.appendChild(list)

                        new mapboxgl.Popup({ closeButton: false, offset: 15 })
                            .setLngLat([primary.lon, primary.lat])
                            .setDOMContent(popupDiv)
                            .addTo(map)
                    })
                }

                wpMarkersRef.current.push(marker)
            })
        }

        if (styleLoadedRef.current) drawRouteAndWaypoints()
        else map.once('style.load', drawRouteAndWaypoints)
    }, [coordinates, waypoints, nextWaypointId])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return
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
            el.title = 'Runner'
            runnerMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(runnerLatLon).addTo(map)
        } else {
            runnerMarkerRef.current.setLngLat(runnerLatLon)
        }
    }, [runnerLatLon])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return
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
            crewMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(crewLatLon).addTo(map)
        } else {
            crewMarkerRef.current.setLngLat(crewLatLon)
        }
    }, [crewLatLon])

    useEffect(() => {
        const map = mapRef.current
        if (!map) return

        const fit = () => {
            const next = waypoints.find(wp => wp.id === nextWaypointId)
            const focusPoints = getFocusCoordinates(coordinates, focusStartMile, focusEndMile)
            const points = [...focusPoints]
            const hasFocusedWindow = focusStartMile != null && focusEndMile != null
                && Number.isFinite(focusStartMile) && Number.isFinite(focusEndMile)

            if (runnerLatLon) points.push(runnerLatLon)
            if (
                next &&
                isFiniteCoordinate(next.lon, next.lat) &&
                (!hasFocusedWindow || (next.mile >= Math.min(focusStartMile, focusEndMile) - 0.1 && next.mile <= Math.max(focusStartMile, focusEndMile) + 0.1))
            ) {
                points.push([next.lon, next.lat])
            }

            if (points.length >= 2) {
                const lons = points.map(point => point[0])
                const lats = points.map(point => point[1])
                const bounds: mapboxgl.LngLatBoundsLike = [
                    [Math.min(...lons), Math.min(...lats)],
                    [Math.max(...lons), Math.max(...lats)],
                ]
                map.fitBounds(bounds, { padding: 44, maxZoom: 15.5, duration: 600 })
                return
            }

            if (points.length === 1) {
                map.easeTo({ center: points[0], zoom: 15, duration: 600 })
                return
            }

            if (coordinates.length > 0) {
                const lons = coordinates.map(coord => coord[0])
                const lats = coordinates.map(coord => coord[1])
                map.fitBounds([
                    [Math.min(...lons), Math.min(...lats)],
                    [Math.max(...lons), Math.max(...lats)],
                ], { padding: 32, maxZoom: 12, duration: 400 })
            }
        }

        if (styleLoadedRef.current) fit()
        else map.once('style.load', fit)
    }, [coordinates, waypoints, nextWaypointId, runnerLatLon, focusStartMile, focusEndMile])

    return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}

function groupWaypoints(waypoints: CrewWaypoint[]) {
    const groups: CrewWaypoint[][] = []
    waypoints.forEach(wp => {
        if (!isFiniteCoordinate(wp.lon, wp.lat)) return
        const existingGroup = groups.find(group =>
            Math.abs(group[0].lat - wp.lat) < 0.0001 &&
            Math.abs(group[0].lon - wp.lon) < 0.0001
        )
        if (existingGroup) existingGroup.push(wp)
        else groups.push([wp])
    })
    return groups
}

function createWaypointMarker(group: CrewWaypoint[], nextWaypointId?: string | null) {
    const primary = group[0]
    const isStack = group.length > 1
    const isStartFinishPair = isStack && group.length === 2
        && group.some(wp => wp.type === 'start')
        && group.some(wp => wp.type === 'finish')
    const isHighlighted = !!nextWaypointId && group.some(wp => wp.id === nextWaypointId)

    const container = document.createElement('div')
    container.className = styles.markerContainer
    container.dataset.id = primary.id
    container.style.width = '24px'
    container.style.height = '24px'
    container.style.display = 'flex'
    container.style.justifyContent = 'center'
    container.style.alignItems = 'center'
    container.style.cursor = 'pointer'

    if (isHighlighted) {
        container.style.transform = 'scale(1.5)'
        container.style.zIndex = '100'
    }

    const el = document.createElement('div')
    el.className = styles.marker

    if (isStartFinishPair) {
        el.style.backgroundColor = 'transparent'
        el.style.border = 'none'
        el.style.boxShadow = 'none'
        el.style.position = 'relative'
        el.style.overflow = 'visible'

        const startHalf = document.createElement('div')
        startHalf.style.cssText = `
            position:absolute;top:0;left:0;width:50%;height:100%;
            background:#16a34a;border:2px solid white;border-right:1px solid white;
            border-top-left-radius:12px;border-bottom-left-radius:12px;
            display:flex;align-items:center;justify-content:center;
            font-size:10px;box-sizing:border-box;
        `
        startHalf.innerHTML = '🟢'

        const finishHalf = document.createElement('div')
        finishHalf.style.cssText = `
            position:absolute;top:0;right:0;width:50%;height:100%;
            background:#dc2626;border:2px solid white;border-left:1px solid white;
            border-top-right-radius:12px;border-bottom-right-radius:12px;
            display:flex;align-items:center;justify-content:center;
            font-size:10px;box-sizing:border-box;
        `
        finishHalf.innerHTML = '🏁'

        el.appendChild(startHalf)
        el.appendChild(finishHalf)
    } else if (primary.type === 'aid_station') {
        el.innerHTML = '+'
        el.style.backgroundColor = '#ef4444'
        el.style.color = 'white'
        el.style.fontWeight = '800'
        el.style.fontSize = '18px'
        el.style.lineHeight = '1'
        el.style.fontFamily = 'sans-serif'
    } else {
        el.innerHTML = getWaypointIcon(primary.type)
        if (primary.type === 'start') el.style.backgroundColor = '#16a34a'
        else if (primary.type === 'finish') el.style.backgroundColor = '#dc2626'
        else if (primary.type === 'water_only') el.style.backgroundColor = '#3b82f6'
        else if (primary.type === 'crew') el.style.backgroundColor = '#a855f7'
        else if (primary.type === 'pacer') el.style.backgroundColor = '#f59e0b'
        else if (primary.type === 'drop_bag') el.style.backgroundColor = '#10b981'
        else if (primary.type === 'medical') el.style.backgroundColor = '#ef4444'
    }

    el.title = isStartFinishPair ? 'Start / Finish' : (isStack ? `${group.length} Waypoints here` : primary.name)
    container.appendChild(el)

    if (isStack && !isStartFinishPair) {
        const stackBadge = document.createElement('div')
        stackBadge.style.cssText = `
            position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:50%;
            background:#ef4444;color:white;font-size:8px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            border:1px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.3);
            pointer-events:none;
        `
        stackBadge.textContent = String(group.length)
        container.appendChild(stackBadge)
    } else if (!isStack) {
        if (primary.crew_allowed) {
            const badge = document.createElement('div')
            badge.className = `${styles.badge} ${styles.badgeCrew}`
            badge.innerHTML = '👥'
            badge.style.pointerEvents = 'none'
            container.appendChild(badge)
        }
        if (primary.pacer_allowed) {
            const badge = document.createElement('div')
            badge.className = `${styles.badge} ${styles.badgePacer}`
            badge.innerHTML = '🏃'
            badge.style.pointerEvents = 'none'
            container.appendChild(badge)
        }
        if (primary.has_drop_bag || primary.type === 'start' || primary.mile <= 0.01 || primary.bag_kind) {
            const badge = document.createElement('div')
            badge.className = `${styles.badge} ${styles.badgeBag}`
            badge.innerHTML = primary.bag_kind === 'crew' ? '📦' : '🎒'
            badge.style.pointerEvents = 'none'
            container.appendChild(badge)
        }
    }

    return container
}

function getFocusCoordinates(
    coordinates: [number, number][],
    startMile?: number | null,
    endMile?: number | null
) {
    if (coordinates.length === 0) return []
    if (startMile == null || endMile == null || !Number.isFinite(startMile) || !Number.isFinite(endMile)) return []

    const start = Math.max(0, Math.min(startMile, endMile))
    const end = Math.max(start, Math.max(startMile, endMile))
    const line: GeoJSON.LineString = { type: 'LineString', coordinates }
    const startCoord = getCoordinateAtDistance(line, start * 1609.34)
    const endCoord = getCoordinateAtDistance(line, end * 1609.34)
    const points: [number, number][] = []
    if (startCoord) points.push(startCoord)

    let cumulative = 0
    for (let i = 0; i < coordinates.length; i += 1) {
        if (i > 0) {
            const prev = coordinates[i - 1]
            const curr = coordinates[i]
            cumulative += getDistance(prev[1], prev[0], curr[1], curr[0])
        }
        if (cumulative >= start && cumulative <= end) points.push(coordinates[i])
    }

    if (endCoord) points.push(endCoord)
    return points
}

function isFiniteCoordinate(lon: number, lat: number) {
    return Number.isFinite(lon) && Number.isFinite(lat)
}

function getWaypointIcon(type: string): string {
    switch (type) {
        case 'start': return '🟢'
        case 'finish': return '🏁'
        case 'aid_station': return '➕'
        case 'water_only': return '💧'
        case 'crew': return '👥'
        case 'pacer': return '🏃'
        case 'drop_bag': return '🎒'
        case 'medical': return '🏥'
        case 'landmark': return '📸'
        default: return '📍'
    }
}
