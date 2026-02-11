'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import along from '@turf/along'
import length from '@turf/length'
import { lineString } from '@turf/helpers'
import MapStyleSwitcher from './MapStyleSwitcher'
import { X, Trash2 } from 'lucide-react'
import styles from './CourseMap.module.css'

interface CourseMapProps {
    coordinates: [number, number][] // [lon, lat] pairs
    bounds?: {
        minLat: number
        maxLat: number
        minLon: number
        maxLon: number
    }
    waypoints?: {
        id: string
        name: string
        lat: number
        lon: number
        mile: number
        type: string
    }[]
    onHover?: (mile: number | null) => void
    highlightMile?: number
    highlightPoint?: { lat: number, lon: number } | null
    onMapClick?: (lat: number, lon: number, type?: string) => void
    onWaypointClick?: (id: string) => void
    onWaypointMove?: (id: string, lat: number, lon: number, mile: number) => void
    className?: string
    terrainNodes?: {
        id: string
        mile: number
        type: string
        lat: number
        lon: number
    }[]
    onTerrainNodeClick?: (id: string) => void
    showMileMarkers?: boolean
    highlightElevation?: number | null
    totalDistance?: number
}

export function CourseMap({
    coordinates,
    // bounds, // removed
    waypoints = [],
    onMapClick,
    onWaypointClick,
    onWaypointMove,
    onHover,
    highlightMile,
    className,
    terrainNodes = [],
    onTerrainNodeClick,
    showMileMarkers = false,
    highlightElevation,
    totalDistance
}: CourseMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const [mapLoaded, setMapLoaded] = useState(false)
    const [selectedPOIType, setSelectedPOIType] = useState<string | null>(null)
    const [isDeleteMode, setIsDeleteMode] = useState(false)
    const [viewState, setViewState] = useState({ zoom: 12, lat: 0, lng: 0 })

    // Restore missing refs/state
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const mileMarkersRef = useRef<mapboxgl.Marker[]>([])
    const [mapStyle, setMapStyle] = useState<'outdoors' | 'streets' | 'satellite'>('outdoors')

    const selectedPOITypeRef = useRef(selectedPOIType)
    const isDeleteModeRef = useRef(isDeleteMode)

    // Sync refs for event listeners
    useEffect(() => { selectedPOITypeRef.current = selectedPOIType }, [selectedPOIType])
    useEffect(() => { isDeleteModeRef.current = isDeleteMode }, [isDeleteMode])

    const handleStyleChange = (style: 'outdoors' | 'streets' | 'satellite') => {
        setMapStyle(style)
        if (map.current) {
            const styleUrl = style === 'satellite'
                ? 'mapbox://styles/mapbox/satellite-streets-v12'
                : (style === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/outdoors-v12')
            map.current.setStyle(styleUrl)
        }
    }

    useEffect(() => {
        if (!mapContainer.current) return

        if (!import.meta.env.VITE_MAPBOX_TOKEN) {
            console.error('Mapbox token missing')
            return
        }

        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

        // Initialize map only once
        if (map.current) return

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/outdoors-v12',
            center: coordinates.length > 0 ? coordinates[0] : [-107.8, 37.9], // Default to somewhere in CO if empty
            zoom: 12
        })

        map.current.on('load', () => {
            setMapLoaded(true)

            if (coordinates.length > 0) {
                // Add the route source and layer
                map.current?.addSource('route', {
                    'type': 'geojson',
                    'data': {
                        'type': 'Feature',
                        'properties': {},
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': coordinates
                        }
                    }
                })

                map.current?.addLayer({
                    'id': 'route',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#e11d48',
                        'line-width': 4
                    }
                })

                // Fit bounds
                const bounds = new mapboxgl.LngLatBounds(
                    coordinates[0],
                    coordinates[0]
                )

                for (const coord of coordinates) {
                    bounds.extend(coord as [number, number])
                }

                map.current?.fitBounds(bounds, {
                    padding: 50
                })
            }

            // Add Controls
            map.current!.addControl(new mapboxgl.NavigationControl(), 'top-right')

            const geolocate = new mapboxgl.GeolocateControl({
                positionOptions: { enableHighAccuracy: true },
                trackUserLocation: true,
                showUserHeading: true
            })
            map.current!.addControl(geolocate, 'top-right')
            // Controls already added above
        })

        return () => {
            map.current?.remove()
            map.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Mile Markers
    useEffect(() => {
        // Remove existing mile markers
        mileMarkersRef.current.forEach(m => m.remove())
        mileMarkersRef.current = []

        if (!map.current || !mapLoaded || !showMileMarkers || coordinates.length < 2) return

        try {
            const line = lineString(coordinates as [number, number][])
            const totalMiles = length(line, { units: 'miles' })
            const interval = totalMiles > 100 ? 10 : totalMiles > 50 ? 5 : 1

            for (let mile = interval; mile < totalMiles; mile += interval) {
                const pt = along(line, mile, { units: 'miles' })
                const [lng, lat] = pt.geometry.coordinates

                const el = document.createElement('div')
                el.className = 'mile-marker'
                el.style.cssText = `
                    width: 20px; height: 20px; border-radius: 50%;
                    background: rgba(255,255,255,0.9); color: #111;
                    font-size: 8px; font-weight: 700; font-family: monospace;
                    display: flex; align-items: center; justify-content: center;
                    border: 1.5px solid #666; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    pointer-events: none;
                `
                el.textContent = String(mile)

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .addTo(map.current!)

                mileMarkersRef.current.push(marker)
            }
        } catch (err) {
            console.warn('Mile marker error:', err)
        }
    }, [showMileMarkers, mapLoaded, coordinates])

    // Terrain Segments Visualization
    useEffect(() => {
        const updateTerrainLayer = async () => {
            if (!map.current || !mapLoaded || coordinates.length === 0 || terrainNodes.length === 0) return

            const m = map.current
            if (m.getSource('terrain-segments')) {
                m.removeLayer('terrain-segments')
                m.removeSource('terrain-segments')
            }

            const { getCoordinateAtDistance, getNearestPointOnLine } = await import('@/lib/geo-utils')
            const geoJson = {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates } }]
            } as any

            const sortedNodes = [...terrainNodes].sort((a, b) => a.mile - b.mile)
            const segments: any[] = []
            let startIndex = 0

            for (const node of sortedNodes) {
                const coord = getCoordinateAtDistance(geoJson, node.mile * 1609.34)
                if (!coord) continue

                const nearest = getNearestPointOnLine({ lat: coord[1], lon: coord[0] }, coordinates)
                if (!nearest) continue

                const endIndex = nearest.index
                const segmentCoords = coordinates.slice(startIndex, endIndex + 1)
                segmentCoords.push([coord[0], coord[1]])

                segments.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: segmentCoords },
                    properties: { type: node.type, color: getTerrainColor(node.type) }
                })

                startIndex = endIndex
            }

            m.addSource('terrain-segments', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: segments }
            })

            m.addLayer({
                id: 'terrain-segments',
                type: 'line',
                source: 'terrain-segments',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': ['get', 'color'], 'line-width': 6 }
            })
        }

        if (mapLoaded && terrainNodes.length > 0) {
            updateTerrainLayer()
        }
    }, [mapLoaded, terrainNodes, coordinates])

    // Update markers with draggable logic and click handlers respecting delete mode
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove())
        markersRef.current = []

        waypoints.forEach(wp => {
            const el = document.createElement('div')
            el.className = styles.marker

            // Icon Logic
            const iconMarkup = getWaypointIcon(wp.type)
            // Use Lucide icons for specific types if desired to match RouteSmith exactly
            // For now, keeping emojis/simple icons but wrapping in HTML for marker

            el.innerHTML = iconMarkup
            el.title = wp.name

            // Apply type-specific styles
            if (wp.type === 'start') el.style.backgroundColor = '#16a34a'
            else if (wp.type === 'finish') el.style.backgroundColor = '#dc2626'
            else if (wp.type === 'aid_station') el.style.backgroundColor = '#2563eb'
            else if (wp.type === 'water_only') el.style.backgroundColor = '#3b82f6'
            else if (wp.type === 'crew') el.style.backgroundColor = '#a855f7'
            else if (wp.type === 'pacer') el.style.backgroundColor = '#f59e0b'
            else if (wp.type === 'drop_bag') el.style.backgroundColor = '#10b981'
            else if (wp.type === 'medical') el.style.backgroundColor = '#ef4444'

            const marker = new mapboxgl.Marker({
                element: el,
                draggable: true // Enable dragging
            })
                .setLngLat([wp.lon, wp.lat])
                .addTo(map.current!)

            // Drag End Listener
            marker.on('dragend', async () => {
                const newLngLat = marker.getLngLat()

                // Snap to route
                if (coordinates.length > 0) {
                    const { getNearestPointOnLine, getDistanceFromStart } = await import('@/lib/geo-utils')
                    const nearest = getNearestPointOnLine({ lat: newLngLat.lat, lon: newLngLat.lng }, coordinates)

                    if (nearest) {
                        // Update marker position visually to snapped point (optional, but good UX)
                        marker.setLngLat([nearest.lon, nearest.lat])

                        const newMile = getDistanceFromStart(coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })

                        if (onWaypointMove) {
                            onWaypointMove(wp.id, nearest.lat, nearest.lon, newMile)
                        }
                    }
                }
            })

            // Add click listener to the marker element
            el.addEventListener('click', (e) => {
                e.stopPropagation()
                // If we just finished dragging, we might trigger click? 
                // Mapbox usually suppresses click on dragend, but let's be safe later if needed.
                if (isDeleteModeRef.current) {
                    if (onWaypointClick) onWaypointClick(wp.id)
                } else {
                    if (onWaypointClick) onWaypointClick(wp.id)
                }
            })

            markersRef.current.push(marker)
        })

        // Add Start/End Markers from coordinates if they don't exist in waypoints
        if (coordinates.length > 0) {
            const startCoord = coordinates[0]
            const endCoord = coordinates[coordinates.length - 1]

            // Check if we already have start/finish waypoints
            const hasStart = waypoints.some(wp => wp.type === 'start')
            const hasFinish = waypoints.some(wp => wp.type === 'finish')

            if (!hasStart) {
                const el = document.createElement('div')
                el.className = styles.marker
                el.innerHTML = getWaypointIcon('start')
                el.title = 'Start'
                el.style.backgroundColor = '#16a34a'

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat(startCoord as [number, number])
                    .addTo(map.current)
                markersRef.current.push(marker)
            }

            if (!hasFinish) {
                const el = document.createElement('div')
                el.className = styles.marker
                el.innerHTML = getWaypointIcon('finish')
                el.title = 'Finish'
                el.style.backgroundColor = '#dc2626'

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat(endCoord as [number, number])
                    .addTo(map.current)
                markersRef.current.push(marker)
            }
        }

        // Terrain Node Markers
        const terrainMarkers: mapboxgl.Marker[] = []
        terrainNodes.forEach(node => {
            const el = document.createElement('div')
            el.className = styles.terrainMarker // Need to add css
            el.style.width = '12px'
            el.style.height = '12px'
            el.style.backgroundColor = getTerrainColor(node.type)
            el.style.border = '2px solid white'
            el.style.borderRadius = '50%' // Circle for now
            el.style.cursor = 'pointer'
            el.title = `${node.type} (${node.mile.toFixed(1)}m)`

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([node.lon, node.lat])
                .addTo(map.current!)

            el.addEventListener('click', (e) => {
                e.stopPropagation()
                if (onTerrainNodeClick) onTerrainNodeClick(node.id)
            })

            terrainMarkers.push(marker)
        })

        return () => {
            // Cleanup terrain markers
            terrainMarkers.forEach(m => m.remove())
        }
    }, [waypoints, mapLoaded, onWaypointClick, coordinates, terrainNodes, onTerrainNodeClick]) // Re-run if waypoints/terrain change

    // Map Hover & Sync Logic
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        const m = map.current

        // Add Hit Area Layer (for easier hovering)
        if (!m.getLayer('route-hit-area') && m.getSource('route')) {
            m.addLayer({
                'id': 'route-hit-area',
                'type': 'line',
                'source': 'route',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': 'transparent',
                    'line-width': 20
                }
            }, 'route') // Add below the visible route line? Or above? Above is better for capture.
            // Actually, if we add it *after* 'route', it's on top.
            // Let's add it before 'route' if we want the visible line on top, but for hit detection it needs to be accessible?
            // "transparent" line on top works fine.
            m.moveLayer('route-hit-area') // Move to top
        }

        // Add Hover Marker Source & Layer
        if (!m.getSource('hover-marker')) {
            m.addSource('hover-marker', {
                'type': 'geojson',
                'data': {
                    'type': 'FeatureCollection',
                    'features': []
                }
            })
        }

        if (!m.getLayer('hover-marker-point')) {
            m.addLayer({
                'id': 'hover-marker-point',
                'type': 'circle',
                'source': 'hover-marker',
                'paint': {
                    'circle-radius': 6,
                    'circle-color': '#fff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#2563eb'
                }
            })
        }

        // Hover Event Listeners
        const onMouseMove = (e: mapboxgl.MapMouseEvent) => {
            if (!onHover) return
            // Calculate distance along route based on cursor position
            // We need a way to project the point onto the line
            // We can use getDistanceAtCoordinate if we have the route geojson
            // But we only have 'coordinates' prop here. We should reconstruct or use useMemo for GeoJSON

            // For efficiency, let's assume we can use the helper with a constructed GeoJSON
            // or pass the GeoJSON source data.
            // @ts-ignore - _data is internal, but we can assume we know what we passed
            const geoJson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates }
                }]
            } as any

            // Dynamic import to avoid SSR issues if any (but we are client-side)
            import('@/lib/geo-utils').then(({ getDistanceAtCoordinate }) => {
                const distMeters = getDistanceAtCoordinate(geoJson, e.lngLat.lng, e.lngLat.lat)
                if (distMeters !== null) {
                    onHover(distMeters / 1609.34) // Convert to miles
                }
            })
        }

        const onMouseLeave = () => {
            if (onHover) onHover(null)
        }

        m.on('mousemove', 'route-hit-area', onMouseMove)
        m.on('mouseleave', 'route-hit-area', onMouseLeave)
        // Also listen on the visible route line just in case
        m.on('mousemove', 'route', onMouseMove)
        m.on('mouseleave', 'route', onMouseLeave)

        return () => {
            m.off('mousemove', 'route-hit-area', onMouseMove)
            m.off('mouseleave', 'route-hit-area', onMouseLeave)
            m.off('mousemove', 'route', onMouseMove)
            m.off('mouseleave', 'route', onMouseLeave)
        }
    }, [mapLoaded, coordinates, onHover])

    // Track View State
    useEffect(() => {
        if (!map.current) return
        const m = map.current

        const onMove = () => {
            const center = m.getCenter()
            setViewState({
                zoom: m.getZoom(),
                lat: center.lat,
                lng: center.lng
            })
        }

        m.on('move', onMove)
        return () => { m.off('move', onMove) }
    }, [mapLoaded])

    // Update Hover Marker when highlightMile changes (from external hover)
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        const updateMarker = async () => {
            const m = map.current!
            const source = m.getSource('hover-marker') as mapboxgl.GeoJSONSource

            if (!source) return

            if (highlightMile !== undefined && highlightMile !== null && coordinates.length > 0) {
                const { getCoordinateAtDistance } = await import('@/lib/geo-utils')

                const geoJson = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates },
                        properties: {}
                    }]
                } as any


                const coord = getCoordinateAtDistance(geoJson, highlightMile * 1609.34)

                if (coord) {
                    source.setData({
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: coord },
                        properties: {}
                    })
                    return
                }
            }

            // Hide marker if no highlight or invalid
            source.setData({ type: 'FeatureCollection', features: [] })
        }

        updateMarker()
    }, [mapLoaded, highlightMile, coordinates])

    // Map Click Handler for Adding Points
    useEffect(() => {
        if (!map.current) return

        const clickHandler = (e: mapboxgl.MapMouseEvent) => {
            // Prevent if clicking on marker (handled by marker element)
            const target = e.originalEvent.target as HTMLElement
            if (target.closest('.mapboxgl-marker')) return

            if (onMapClick) {
                // Pass the selected type if any
                onMapClick(e.lngLat.lat, e.lngLat.lng, selectedPOITypeRef.current || undefined)

                // Reset tool after use (optional? RouteSmith resets)
                if (selectedPOITypeRef.current) {
                    setSelectedPOIType(null)
                }
            }
        }

        map.current.on('click', clickHandler)
        return () => { map.current?.off('click', clickHandler) }
    }, [mapLoaded, onMapClick])
    return (
        <div className={`${styles.container} ${className || ''}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px' }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            < MapStyleSwitcher currentStyle={mapStyle as any} onStyleChange={handleStyleChange as any} />

            <div
                ref={mapContainer}
                className={`${styles.map} ${(selectedPOIType || isDeleteMode) ? styles.crosshair : ''}`}
                style={{ width: '100%', height: '100%' }}
            />

            {/* Toolbar */}
            <div className={styles.toolbar}>
                {[
                    { type: 'aid_station', icon: '⛺', label: 'Aid Station', color: '#2563eb' },
                    { type: 'water_only', icon: '💧', label: 'Water', color: '#3b82f6' },
                    { type: 'crew', icon: '👥', label: 'Crew', color: '#a855f7' },
                    { type: 'pacer', icon: '🏃', label: 'Pacer', color: '#f59e0b' },
                    { type: 'drop_bag', icon: '🎒', label: 'Drop Bag', color: '#10b981' },
                ].map((tool) => (
                    <button
                        key={tool.type}
                        onClick={() => {
                            setIsDeleteMode(false)
                            setSelectedPOIType(selectedPOIType === tool.type ? null : tool.type)
                        }}
                        className={`${styles.toolBtn} ${selectedPOIType === tool.type ? styles.activeTool : ''}`}
                        title={`Add ${tool.label}`}
                        type="button"
                        style={{ color: tool.color }}
                    >
                        {tool.icon}
                    </button>
                ))}

                <div className={styles.divider} />

                <button
                    onClick={() => {
                        setSelectedPOIType(null)
                        setIsDeleteMode(!isDeleteMode)
                    }}
                    className={`${styles.toolBtn} ${isDeleteMode ? styles.activeDelete : ''}`}
                    title="Delete Mode (Click marker to edit/delete)"
                    type="button"
                >
                    <Trash2 size={18} />
                </button>

                {(selectedPOIType || isDeleteMode) && (
                    <button
                        onClick={() => {
                            setSelectedPOIType(null)
                            setIsDeleteMode(false)
                        }}
                        className={styles.closeToolBtn}
                        title="Cancel"
                        type="button"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {
                !import.meta.env.VITE_MAPBOX_TOKEN && (
                    <div className={styles.noToken}>
                        <p>Mapbox token not configured</p>
                        <p className={styles.hint}>Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local</p>
                    </div>
                )
            }

            {/* Info Overlay — show mile + elevation on hover, otherwise total distance */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm border border-neutral-700 text-xs font-mono text-neutral-300 z-10 pointer-events-none tabular-nums">
                {highlightMile !== undefined && highlightMile !== null ? (
                    <>
                        Mile {highlightMile.toFixed(1)}
                        {highlightElevation !== undefined && highlightElevation !== null && (
                            <> | {Math.round(highlightElevation).toLocaleString()} ft</>
                        )}
                    </>
                ) : (
                    <>{totalDistance ? `${totalDistance.toFixed(1)} miles` : `${viewState.lat.toFixed(4)}, ${viewState.lng.toFixed(4)}`}</>
                )}
            </div>
        </div >
    )
}

function getWaypointIcon(type: string): string {
    switch (type) {
        case 'start': return '🏁'
        case 'finish': return '🏁'
        case 'aid_station': return '⛺' // Tent
        case 'water_only': return '💧'
        case 'crew': return '👥'
        case 'pacer': return '🏃'
        case 'drop_bag': return '🎒'
        case 'medical': return '🏥'
        case 'landmark': return '📸'
        default: return '📍'
    }
}

function getTerrainColor(type: string): string {
    switch (type) {
        case 'paved': return '#94a3b8' // Slate 400
        case 'dirt': return '#d97706' // Amber 600
        case 'double_track': return '#854d0e' // Yellow 800
        case 'single_track': return '#166534' // Green 700
        case 'technical': return '#dc2626' // Red 600
        case 'other': return '#64748b'
        default: return '#e11d48'
    }
}
