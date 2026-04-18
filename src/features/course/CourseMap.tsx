import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import along from '@turf/along'
import length from '@turf/length'
import { lineString } from '@turf/helpers'
import { X, Trash2, MapPin, Milestone } from 'lucide-react'

import MapStyleSwitcher from './MapStyleSwitcher'
import { getNearestPointOnLine, getDistanceFromStart, getCoordinateAtDistance, getDistanceAtCoordinate } from '@/lib/geo-utils'
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
        has_drop_bag?: boolean
        crew_allowed?: boolean
        pacer_allowed?: boolean
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
    onToggleMileMarkers?: () => void
    isTerrainMode?: boolean
    highlightElevation?: number | null
    totalDistance?: number
    highlightedWaypointId?: string | null // New prop
    highlightedTerrainId?: string | null // Highlight terrain node being edited
    onSaveTerrain?: (start: number, end: number, type: string, difficulty: number) => void
    onTerrainNodeMove?: (id: string, lat: number, lon: number, mile: number) => void
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
    onToggleMileMarkers,
    highlightElevation,
    totalDistance,
    highlightedWaypointId,
    highlightedTerrainId,
    onSaveTerrain,
    onTerrainNodeMove
}: CourseMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const [mapLoaded, setMapLoaded] = useState(false)
    const [styleLoaded, setStyleLoaded] = useState(false) // Track style loading
    const [selectedPOIType, setSelectedPOIType] = useState<string | null>(null)
    const [isTerrainMode, setIsTerrainMode] = useState(false)
    const [terrainSelection, setTerrainSelection] = useState<{
        start: { lat: number, lon: number, mile: number } | null
        end: { lat: number, lon: number, mile: number } | null
    }>({ start: null, end: null })
    const [isDeleteMode, setIsDeleteMode] = useState(false)
    const [viewState, setViewState] = useState({ zoom: 12, lat: 0, lng: 0 })

    // Restore missing refs/state
    const markersRef = useRef<mapboxgl.Marker[]>([])
    const mileMarkersRef = useRef<mapboxgl.Marker[]>([])
    const terrainSelectionMarkersRef = useRef<mapboxgl.Marker[]>([])
    const [mapStyle, setMapStyle] = useState<'outdoors' | 'streets' | 'satellite'>('outdoors')

    const selectedPOITypeRef = useRef(selectedPOIType)
    const isDeleteModeRef = useRef(isDeleteMode)
    const onWaypointClickRef = useRef(onWaypointClick)
    const onWaypointMoveRef = useRef(onWaypointMove)
    const onTerrainNodeClickRef = useRef(onTerrainNodeClick)
    const onTerrainNodeMoveRef = useRef(onTerrainNodeMove)
    const onMapClickRef = useRef(onMapClick)
    const isTerrainModeRef = useRef(isTerrainMode)
    const terrainSelectionRef = useRef(terrainSelection)

    // Sync refs for event listeners
    useEffect(() => { selectedPOITypeRef.current = selectedPOIType }, [selectedPOIType])
    useEffect(() => { isDeleteModeRef.current = isDeleteMode }, [isDeleteMode])
    useEffect(() => { onWaypointClickRef.current = onWaypointClick }, [onWaypointClick])
    useEffect(() => { onWaypointMoveRef.current = onWaypointMove }, [onWaypointMove])
    useEffect(() => { onTerrainNodeClickRef.current = onTerrainNodeClick }, [onTerrainNodeClick])
    useEffect(() => { onTerrainNodeMoveRef.current = onTerrainNodeMove }, [onTerrainNodeMove])
    useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
    useEffect(() => { isTerrainModeRef.current = isTerrainMode }, [isTerrainMode])
    useEffect(() => { terrainSelectionRef.current = terrainSelection }, [terrainSelection])

    const handleStyleChange = (style: 'outdoors' | 'streets' | 'satellite') => {
        if (style === mapStyle) return
        setMapStyle(style)
        setStyleLoaded(false) // Reset style loaded
        if (map.current) {
            const styleUrl = style === 'satellite'
                ? 'mapbox://styles/mapbox/satellite-streets-v12'
                : (style === 'streets' ? 'mapbox://styles/mapbox/streets-v12' : 'mapbox://styles/mapbox/outdoors-v12')
            map.current.setStyle(styleUrl)
        }
    }

    // Toggle Terrain Mode
    const toggleTerrainMode = () => {
        setIsTerrainMode(!isTerrainMode)
        // Clear selection when exiting
        if (isTerrainMode) {
            setTerrainSelection({ start: null, end: null })
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
            setStyleLoaded(true) // Initial style loaded

            // Controls
            map.current!.addControl(new mapboxgl.NavigationControl(), 'top-right')

            const geolocate = new mapboxgl.GeolocateControl({
                positionOptions: { enableHighAccuracy: true },
                trackUserLocation: true,
                showUserHeading: true
            })
            map.current!.addControl(geolocate, 'top-right')
        })

        // Listen for style load events (triggered after setStyle)
        map.current.on('style.load', () => {
            setStyleLoaded(true)
        })

        return () => {
            map.current?.remove()
            map.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Reactive Route Update & Fit Bounds
    useEffect(() => {
        if (!map.current || !styleLoaded || coordinates.length === 0) return

        const m = map.current

        // Add or Update Source
        const sourceData = {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates
            }
        } as any

        if (m.getSource('route')) {
            (m.getSource('route') as mapboxgl.GeoJSONSource).setData(sourceData)
        } else {
            m.addSource('route', {
                'type': 'geojson',
                'data': sourceData
            })

            m.addLayer({
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
        }

        // Fit bounds
        // Check if we should fit bounds?
        // We always fit bounds on mount (tab switch) or if coordinates change significantly?
        // Let's always fit bounds when coordinates update, which covers the tab switch case.
        try {
            const bounds = new mapboxgl.LngLatBounds(
                coordinates[0],
                coordinates[0]
            )

            for (const coord of coordinates) {
                bounds.extend(coord as [number, number])
            }

            m.fitBounds(bounds, {
                padding: 50,
                duration: 1000 // Smooth animation
            })
        } catch (e) {
            console.warn('Error fitting bounds:', e)
        }
    }, [styleLoaded, coordinates])

    // Mile Markers
    useEffect(() => {
        // Remove existing mile markers
        mileMarkersRef.current.forEach(m => m.remove())
        mileMarkersRef.current = []

        if (!map.current || !styleLoaded || !showMileMarkers || isTerrainMode || coordinates.length < 2) return

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
                    position: absolute; top: 0; left: 0;
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
    }, [showMileMarkers, styleLoaded, coordinates, isTerrainMode, highlightedWaypointId])




    // Terrain Segments Visualization
    useEffect(() => {
        const updateTerrainLayer = async () => {
            if (!map.current || !styleLoaded || coordinates.length === 0) return

            const m = map.current

            // 0. Base Route Layer (Background Canvas)
            // This is the "Unspecified" layer that shows through gaps
            if (!m.getSource('base-route')) {
                m.addSource('base-route', {
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
                m.addLayer({
                    'id': 'base-route',
                    'type': 'line',
                    'source': 'base-route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#4b5563', // Gray-600
                        'line-width': 6
                    }
                }, 'route') // Add BEFORE 'route' (highlight) layer if it exists, or just bottom
                // Actually 'route' layer above is the red highlight? No, 'route' is the main line.
                // We want this base-route to be the main visual if we are in terrain mode?
                // The existing 'route' layer is RED (#e11d48).
                // If we want the Base to be Gray, we should probably hide the 'route' layer or change its color?
                // OR we layer this ON TOP of 'route' but 'route' is hidden?
                // Let's assume 'terrain-segments' sits on top of 'base-route'.
                // And 'route' (the red line) might interfere.
                // Let's toggle 'route' visibility based on mode?
                // For now, let's just make sure 'terrain-segments' and 'base-route' are above 'route' or replace it.
                // The 'route' layer is added effectively on mount.
            }

            // Toggle Main 'route' layer visibility
            if (m.getLayer('route')) {
                m.setLayoutProperty('route', 'visibility', terrainNodes.length > 0 || isTerrainMode ? 'none' : 'visible')
            }


            if (m.getSource('terrain-segments')) {
                m.removeLayer('terrain-segments')
                m.removeSource('terrain-segments')
            }

            if (terrainNodes.length === 0) return


            const geoJson = {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates } }]
            } as any

            const sortedNodes = [...terrainNodes].sort((a, b) => a.mile - b.mile)
            const features: any[] = []

            // Helper to get index
            const getIndexAtMile = (m: number) => {
                const coord = getCoordinateAtDistance(geoJson, m * 1609.34)
                if (!coord) return coordinates.length - 1
                const nearest = getNearestPointOnLine({ lat: coord[1], lon: coord[0] }, coordinates)
                return nearest ? nearest.index : coordinates.length - 1
            }

            // 1. Initial Segment (0 to first node)
            // If first node is > 0, the segment 0->FirstNode is "Default" (Gray).
            // We do NOT add a feature for it, letting Base Layer show.
            // UNLESS the user wants explicit "Paved" default? 
            // User said: "default color... maybe black or gray... separate from colored segments".
            // So we rely on the Base Layer.

            // 2. Node Segments
            for (let i = 0; i < sortedNodes.length; i++) {
                const node = sortedNodes[i]
                const nextNode = sortedNodes[i + 1]

                const startIndex = getIndexAtMile(node.mile)
                const endIndex = nextNode ? getIndexAtMile(nextNode.mile) : coordinates.length - 1

                if (startIndex >= endIndex) continue

                // FILTER: Only draw if type != 'default'
                if (node.type === 'default' || node.type === 'other') continue

                const segmentCoords = coordinates.slice(startIndex, endIndex + 1)

                features.push({
                    type: 'Feature',
                    id: node.id, // ID at top level for feature-state
                    geometry: { type: 'LineString', coordinates: segmentCoords },
                    properties: { type: node.type, color: getTerrainColor(node.type), nodeId: node.id }
                })
            }

            m.addSource('terrain-segments', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features }
            })

            m.addLayer({
                id: 'terrain-segments',
                type: 'line',
                source: 'terrain-segments',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': ['get', 'color'],
                    'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 10, 6]
                }
            })

            // ... interactions ...
        }

        updateTerrainLayer()
    }, [mapLoaded, terrainNodes, coordinates, isTerrainMode, styleLoaded])

    // Terrain Highlighting Effect
    const lastHighlightedTerrainRef = useRef<string | null>(null)
    useEffect(() => {
        if (!map.current || !mapLoaded) return
        const m = map.current

        // Remove previous highlight
        if (lastHighlightedTerrainRef.current) {
            if (m.getSource('terrain-segments')) {
                m.setFeatureState(
                    { source: 'terrain-segments', id: lastHighlightedTerrainRef.current },
                    { hover: false }
                )
            }
        }

        // Add new highlight
        if (highlightedTerrainId) {
            if (m.getSource('terrain-segments')) {
                m.setFeatureState(
                    { source: 'terrain-segments', id: highlightedTerrainId },
                    { hover: true }
                )
            }
        }

        lastHighlightedTerrainRef.current = highlightedTerrainId || null
    }, [highlightedTerrainId, mapLoaded, terrainNodes]) // terrainNodes dep ensures we re-apply if layer rebuilds


    // ... (rest of file)

    // ... (inside getWaypointIcon)
    // Terrain Node Markers
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        const terrainMarkers: mapboxgl.Marker[] = []

        const updateTerrainMarkers = async () => {
            const m = map.current
            if (!m) return

            // Cleanup old locally tracked markers (if any from previous run of this function, though effect cleanup handles mostly)
            terrainMarkers.forEach(mk => mk.remove())
            terrainMarkers.length = 0


            const geoJson = {
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates } }]
            } as any

            for (const node of terrainNodes) {
                let { lat, lon } = node

                if (!lat || !lon || (lat === 0 && lon === 0)) {
                    const coord = getCoordinateAtDistance(geoJson, node.mile * 1609.34)
                    if (coord) {
                        lon = coord[0]
                        lat = coord[1]
                    } else {
                        continue
                    }
                }

                const el = document.createElement('div')
                el.className = styles.terrainMarker
                el.style.display = 'block'
                // Default nodes (boundary markers) vs Type nodes
                const isDefault = node.type === 'default'

                el.style.width = isTerrainMode ? '16px' : '10px'
                el.style.height = isTerrainMode ? '16px' : '10px'
                el.style.backgroundColor = getTerrainColor(node.type)
                el.style.borderRadius = '50%'
                el.style.border = '2px solid white'
                el.style.cursor = isTerrainMode ? 'move' : 'pointer'
                el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)'
                el.style.zIndex = isDefault ? '25' : '30'
                el.title = `${node.type} (${node.mile.toFixed(1)}m)`

                const marker = new mapboxgl.Marker({
                    element: el,
                    draggable: isTerrainMode
                })
                    .setLngLat([lon, lat])
                    .addTo(m)

                if (isTerrainMode) {
                    marker.on('dragend', () => {
                        const newLngLat = marker.getLngLat()
                        const snap = getNearestPointOnLine({ lat: newLngLat.lat, lon: newLngLat.lng }, coordinates)
                        if (snap) {
                            const newMile = getDistanceFromStart(coordinates, snap.index, { lat: snap.lat, lon: snap.lon })
                            marker.setLngLat([snap.lon, snap.lat])
                            if (onTerrainNodeMoveRef.current) {
                                onTerrainNodeMoveRef.current(node.id, snap.lat, snap.lon, newMile)
                            }
                        }
                    })
                }

                el.addEventListener('click', (e) => {
                    e.stopPropagation()
                    if (onTerrainNodeClickRef.current) onTerrainNodeClickRef.current(node.id)
                })

                terrainMarkers.push(marker)
            }
        }

        updateTerrainMarkers()

        return () => {
            terrainMarkers.forEach(m => m.remove())
        }
    }, [mapLoaded, terrainNodes, coordinates, isTerrainMode])

    // Waypoint Markers
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        // Cleanup existing
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        if (isTerrainMode) return

        // Group waypoints
        const groups: typeof waypoints[] = []
        waypoints.forEach(wp => {
            const existingGroup = groups.find(g =>
                Math.abs(g[0].lat - wp.lat) < 0.0001 &&
                Math.abs(g[0].lon - wp.lon) < 0.0001
            )
            if (existingGroup) {
                existingGroup.push(wp)
            } else {
                groups.push([wp])
            }
        })

        // Render groups
        groups.forEach(group => {
            group.sort((a, b) => a.mile - b.mile)

            const primaryWp = group[0]
            const isStack = group.length > 1
            const isStartFinishPair = isStack && group.length === 2
                && group.some(w => w.type === 'start')
                && group.some(w => w.type === 'finish')
            let wasDragged = false

            const container = document.createElement('div')
            container.className = styles.markerContainer
            container.dataset.id = primaryWp.id
            container.style.width = '24px'
            container.style.height = '24px'
            container.style.display = 'flex'
            container.style.justifyContent = 'center'
            container.style.alignItems = 'center'
            container.style.cursor = 'grab'

            // Highlight Logic
            const isHighlighted = highlightedWaypointId && group.some(w => w.id === highlightedWaypointId)
            if (isHighlighted) {
                container.style.transform = 'scale(1.5)'
                container.style.zIndex = '100'
                // container.style.boxShadow = '0 0 10px rgba(255,255,255,0.8)' // Optional glow
            }

            const el = document.createElement('div')
            el.className = styles.marker

            if (isStartFinishPair) {
                // Split marker: green Start on the left, red Finish on the right.
                el.style.backgroundColor = 'transparent'
                el.style.border = 'none'
                el.style.boxShadow = 'none'
                el.style.position = 'relative'
                el.style.overflow = 'visible'

                const startHalf = document.createElement('div')
                startHalf.style.cssText = `
                    position: absolute; top: 0; left: 0;
                    width: 50%; height: 100%;
                    background: #16a34a;
                    border: 2px solid white; border-right: 1px solid white;
                    border-top-left-radius: 12px; border-bottom-left-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 10px; box-sizing: border-box;
                `
                startHalf.innerHTML = '🟢'

                const finishHalf = document.createElement('div')
                finishHalf.style.cssText = `
                    position: absolute; top: 0; right: 0;
                    width: 50%; height: 100%;
                    background: #dc2626;
                    border: 2px solid white; border-left: 1px solid white;
                    border-top-right-radius: 12px; border-bottom-right-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 10px; box-sizing: border-box;
                `
                finishHalf.innerHTML = '🏁'

                el.appendChild(startHalf)
                el.appendChild(finishHalf)
            } else if (primaryWp.type === 'aid_station') {
                // Custom Style for Aid Station: Red bg, White Bold +
                el.innerHTML = '+'
                el.style.backgroundColor = '#ef4444' // red-500
                el.style.color = 'white'
                el.style.fontWeight = '800' // Extra Bold
                el.style.fontSize = '18px'
                el.style.lineHeight = '1' // Center vertically
                el.style.fontFamily = 'sans-serif'
            } else {
                const iconMarkup = getWaypointIcon(primaryWp.type)
                el.innerHTML = iconMarkup

                if (primaryWp.type === 'start') el.style.backgroundColor = '#16a34a'
                else if (primaryWp.type === 'finish') el.style.backgroundColor = '#dc2626'
                // else if (primaryWp.type === 'aid_station') el.style.backgroundColor = '#2563eb' // Overridden above
                else if (primaryWp.type === 'water_only') el.style.backgroundColor = '#3b82f6'
                else if (primaryWp.type === 'crew') el.style.backgroundColor = '#a855f7'
                else if (primaryWp.type === 'pacer') el.style.backgroundColor = '#f59e0b'
                else if (primaryWp.type === 'drop_bag') el.style.backgroundColor = '#10b981'
                else if (primaryWp.type === 'medical') el.style.backgroundColor = '#ef4444'
            }

            el.title = isStartFinishPair ? 'Start / Finish' : (isStack ? `${group.length} Waypoints here` : primaryWp.name)

            container.appendChild(el)

            if (isStack && !isStartFinishPair) {
                const stackBadge = document.createElement('div')
                stackBadge.style.cssText = `
                    position: absolute; top: -6px; right: -6px;
                    width: 14px; height: 14px; border-radius: 50%;
                    background: #ef4444; color: white;
                    font-size: 8px; font-weight: 700;
                    display: flex; align-items: center; justify-content: center;
                    border: 1px solid white; box-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    pointer-events: none;
                `
                stackBadge.textContent = String(group.length)
                container.appendChild(stackBadge)
            } else if (!isStack) {
                // Badges
                if (primaryWp.crew_allowed) {
                    const badge = document.createElement('div')
                    badge.className = `${styles.badge} ${styles.badgeCrew}`
                    badge.innerHTML = '👥'
                    badge.style.pointerEvents = 'none'
                    container.appendChild(badge)
                }
                if (primaryWp.pacer_allowed) {
                    const badge = document.createElement('div')
                    badge.className = `${styles.badge} ${styles.badgePacer}`
                    badge.innerHTML = '🏃'
                    badge.style.pointerEvents = 'none'
                    container.appendChild(badge)
                }
                if (primaryWp.has_drop_bag) {
                    const badge = document.createElement('div')
                    badge.className = `${styles.badge} ${styles.badgeBag}`
                    badge.innerHTML = '🎒'
                    badge.style.pointerEvents = 'none'
                    container.appendChild(badge)
                }
            }

            const marker = new mapboxgl.Marker({
                element: container,
                draggable: true,
                anchor: 'center',
                offset: [0, 0]
            })
                .setLngLat([primaryWp.lon, primaryWp.lat])
                .addTo(map.current!)

            marker.on('dragstart', () => {
                wasDragged = true
                el.classList.add(styles.dragging)
            })

            marker.on('dragend', () => {
                el.classList.remove(styles.dragging)
                const newLngLat = marker.getLngLat()

                // Geo utils needed for drag snap
                // We'll import dynamically if needed or assume we can access them if we import them inside or have them top level?
                // The previous code block for Waypoints didn't show imports.
                // But we can just restart the import or use the top level ones if available.
                // Assuming top level imports are available for getNearestPointOnLine etc.
                // Actually, I removed the top level import in my mind? No, step 321 shows imports at top of file (lines 11).
                // So we can use `getNearestPointOnLine` directly.

                if (coordinates.length > 0) {
                    const snapNearest = getNearestPointOnLine(
                        { lat: newLngLat.lat, lon: newLngLat.lng },
                        coordinates
                    )
                    if (snapNearest) {
                        marker.setLngLat([snapNearest.lon, snapNearest.lat])

                        const sharedLat = snapNearest.lat
                        const sharedLon = snapNearest.lon

                        for (const wp of group) {
                            const nearest = getNearestPointOnLine(
                                { lat: sharedLat, lon: sharedLon }, // use snapped
                                coordinates,
                                wp.mile
                            )
                            if (nearest && onWaypointMoveRef.current) {
                                const newMile = getDistanceFromStart(coordinates, nearest.index, { lat: nearest.lat, lon: nearest.lon })
                                onWaypointMoveRef.current(wp.id, sharedLat, sharedLon, newMile)
                            }
                        }
                    }
                }
            })

            container.addEventListener('click', (e) => {
                e.stopPropagation()
                if (wasDragged) {
                    wasDragged = false
                    return
                }

                if (isStack) {
                    // ... Popup logic ...
                    const popupDiv = document.createElement('div')
                    popupDiv.className = 'p-2 min-w-[160px]'
                    popupDiv.innerHTML = `<div class="text-[10px] font-bold text-neutral-400 uppercase mb-2 tracking-wider">Select Visit</div>`

                    const list = document.createElement('div')
                    list.className = 'flex flex-col gap-1'

                    group.forEach(wp => {
                        const btn = document.createElement('button')
                        btn.className = 'text-left text-sm py-2 px-2 hover:bg-blue-50 rounded flex justify-between items-center transition-colors w-full group'
                        btn.innerHTML = `
                            <span class="font-medium text-neutral-700">${wp.name}</span>
                            <span class="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded group-hover:bg-white transition-colors">Mi ${wp.mile.toFixed(1)}</span>
                        `
                        btn.onclick = () => {
                            if (onWaypointClickRef.current) onWaypointClickRef.current(wp.id)
                            marker.getPopup()?.remove()
                        }
                        list.appendChild(btn)
                    })
                    popupDiv.appendChild(list)

                    new mapboxgl.Popup({ closeButton: false, offset: 15 })
                        .setLngLat([primaryWp.lon, primaryWp.lat])
                        .setDOMContent(popupDiv)
                        .addTo(map.current!)

                } else {
                    if (onWaypointClickRef.current) onWaypointClickRef.current(primaryWp.id)
                }
            })

            markersRef.current.push(marker)
        })

        return () => {
            markersRef.current.forEach(m => m.remove())
            markersRef.current = []
        }
    }, [waypoints, mapLoaded, coordinates, terrainNodes, isTerrainMode, highlightedWaypointId])

    // Terrain Selection Visuals (Markers & Line)
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        // Clear existing selection markers
        terrainSelectionMarkersRef.current.forEach(m => m.remove())
        terrainSelectionMarkersRef.current = []

        const m = map.current

        // Update/Remove Line Layer
        if (m.getSource('terrain-selection')) {
            m.removeLayer('terrain-selection-line')

            m.removeSource('terrain-selection')
        }

        if (isTerrainMode && (terrainSelection.start || terrainSelection.end) && coordinates.length > 0) {
            const { start, end } = terrainSelection

            // Draw Line if both exist
            if (start && end) {
                const startIndex = getNearestPointOnLine({ lat: start.lat, lon: start.lon }, coordinates)?.index ?? 0
                const endIndex = getNearestPointOnLine({ lat: end.lat, lon: end.lon }, coordinates)?.index ?? 0

                // Handle different orders
                const minIdx = Math.min(startIndex, endIndex)
                const maxIdx = Math.max(startIndex, endIndex)

                const segmentCoords = coordinates.slice(minIdx, maxIdx + 1)

                m.addSource('terrain-selection', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: segmentCoords
                        },
                        properties: {}
                    }
                })

                m.addLayer({
                    id: 'terrain-selection-line',
                    type: 'line',
                    source: 'terrain-selection',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#fbbf24', // Amber/Yellow
                        'line-width': 6,
                        'line-dasharray': [2, 2]
                    }
                })
            }

            // Create Draggable Markers for Start/End
            const createSelectionMarker = (point: { lat: number, lon: number, mile: number }, type: 'start' | 'end') => {
                const el = document.createElement('div')
                el.className = 'w-4 h-4 rounded-full bg-amber-500 border-2 border-white cursor-grab hover:scale-110 transition-transform shadow-md'

                const marker = new mapboxgl.Marker({ element: el, draggable: true })
                    .setLngLat([point.lon, point.lat])
                    .addTo(m)

                marker.on('dragend', () => {
                    const newLngLat = marker.getLngLat()
                    // Snap to route
                    const snap = getNearestPointOnLine({ lat: newLngLat.lat, lon: newLngLat.lng }, coordinates)
                    if (snap) {
                        // Recalculate mile
                        // We need getDistanceFromStart logic here or pass it via callback?
                        // For now, let's just update the lat/lon visible. 
                        // To update the 'mile', we truly need the context of the whole route.
                        // But we are inside CourseMap, we have `coordinates`.
                        // We need `getDistanceFromStart` from geo-utils.

                        // We will rely on re-clicking for now OR implement full drag logic if import is easy.
                        // Let's rely on click to set for MVP or implement full drag in next step if user requests.
                        // Wait, plan said "Draggable Handles". I should try to support it.
                        // BUT `getDistanceFromStart` is imported.

                        const newMile = getDistanceFromStart(coordinates, snap.index, { lat: snap.lat, lon: snap.lon })

                        marker.setLngLat([snap.lon, snap.lat])

                        setTerrainSelection(prev => ({
                            ...prev,
                            [type]: { lat: snap.lat, lon: snap.lon, mile: newMile }
                        }))
                    }
                })

                terrainSelectionMarkersRef.current.push(marker)
            }

            if (start) createSelectionMarker(start, 'start')
            if (end) createSelectionMarker(end, 'end')
        }

    }, [isTerrainMode, terrainSelection, mapLoaded, coordinates])

    // Handle Waypoint Highlighting independent of marker recreation
    useEffect(() => {
        if (!mapLoaded) return

        markersRef.current.forEach(marker => {
            const el = marker.getElement()
            const id = el.dataset.id
            if (id === highlightedWaypointId) {
                el.classList.add(styles.highlighted)
                el.style.pointerEvents = 'auto'
            } else {
                el.classList.remove(styles.highlighted)
                // Only disable pointer events on non-highlighted markers when a waypoint IS highlighted
                el.style.pointerEvents = highlightedWaypointId ? 'none' : 'auto'
            }
        })
    }, [highlightedWaypointId, mapLoaded])

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
            const geoJson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates }
                }]
            } as any

            // Dynamic import to avoid SSR issues if any (but we are client-side)
            const distMeters = getDistanceAtCoordinate(geoJson, e.lngLat.lng, e.lngLat.lat)
            if (distMeters !== null) {
                onHover(distMeters / 1609.34) // Convert to miles
            }
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

            // Terrain Selection Mode
            if (isTerrainModeRef.current) {
                const lngLat = e.lngLat
                const snap = getNearestPointOnLine({ lat: lngLat.lat, lon: lngLat.lng }, coordinates)

                if (snap) {
                    const mile = getDistanceFromStart(coordinates, snap.index, { lat: snap.lat, lon: snap.lon })
                    const point = { lat: snap.lat, lon: snap.lon, mile }

                    setTerrainSelection(prev => {
                        if (!prev.start) return { start: point, end: null }
                        if (!prev.end) return { ...prev, end: point }
                        // If both exist, reset start to new point, clear end
                        return { start: point, end: null }
                    })
                }
                return // Stop regular map click
            }

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
    }, [mapLoaded, onMapClick, coordinates]) // Added coordinates dependency
    return (
        <div className={`${styles.container} ${className || ''}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            < MapStyleSwitcher currentStyle={mapStyle as any} onStyleChange={handleStyleChange as any} />

            <div
                ref={mapContainer}
                className={`${styles.map} ${(selectedPOIType || isDeleteMode) ? styles.crosshair : ''}`}
                style={{ width: '100%', height: '100%' }}
            />

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <button
                    onClick={() => {
                        setIsDeleteMode(false)
                        setSelectedPOIType(selectedPOIType === 'aid_station' ? null : 'aid_station')
                    }}
                    className={`${styles.toolBtn} ${selectedPOIType ? styles.activeTool : ''}`}
                    title="Add Waypoint"
                    type="button"
                >
                    <MapPin size={18} />
                </button>

                <button
                    onClick={onToggleMileMarkers}
                    className={`${styles.toolBtn} ${showMileMarkers ? styles.activeTool : ''}`}
                    title="Toggle Mile Markers"
                    type="button"
                >
                    <Milestone size={18} />
                </button>

                <button
                    onClick={toggleTerrainMode}
                    className={`${styles.toolBtn} ${isTerrainMode ? 'bg-amber-100 border-amber-500 text-amber-700' : ''}`}
                    title="Terrain Mode"
                    type="button"
                >
                    {/* Fallback icon if MapPin is used for waypoints, maybe Mountain/Terrain icon? */}
                    {/* CourseMap imports MapPin. Let's reuse or use something distinct. */}
                    {/* No Mountain icon imported. I'll use a text char or distinct style MapPin for now, or assume MapPin is fine. */}
                    {/* Actually, let's just use MapPin with specific style or maybe a different icon if available. */}
                    <div className={isTerrainMode ? 'text-amber-600 font-bold' : ''}>T</div>
                </button>

                <div className={styles.divider} />

                <button
                    onClick={() => {
                        setSelectedPOIType(null)
                        setIsDeleteMode(!isDeleteMode)
                    }}
                    className={`${styles.toolBtn} ${isDeleteMode ? styles.activeDelete : ''}`}
                    title="Delete Mode"
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

            {/* Terrain Selection Popup */}
            {isTerrainMode && terrainSelection.start && terrainSelection.end && (
                <div className="absolute top-20 left-4 bg-white p-4 rounded-lg shadow-xl z-20 w-72 animate-in fade-in slide-in-from-left-4 border border-neutral-200">
                    <h3 className="text-sm font-bold text-neutral-900 mb-3 border-b pb-2">Set Terrain Segment</h3>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div>
                            <label className="text-neutral-500 block mb-1">Start Mile</label>
                            <div className="font-mono font-medium text-neutral-900">{terrainSelection.start.mile.toFixed(2)}</div>
                        </div>
                        <div>
                            <label className="text-neutral-500 block mb-1">End Mile</label>
                            <div className="font-mono font-medium text-neutral-900">{terrainSelection.end.mile.toFixed(2)}</div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-neutral-700 block mb-1">Terrain Type</label>
                            <select
                                id="terrain-type-select"
                                className="w-full text-sm border border-neutral-300 rounded p-1.5 bg-neutral-50 text-neutral-900"
                                defaultValue="paved"
                                onChange={(e) => {
                                    const val = e.target.value
                                    let diff = 100
                                    switch (val) {
                                        case 'paved': diff = 100; break;
                                        case 'dirt': diff = 104; break;
                                        case 'double_track': diff = 108; break;
                                        case 'single_track': diff = 115; break;
                                        case 'technical': diff = 130; break;
                                        default: diff = 100;
                                    }
                                    const slider = document.getElementById('terrain-factor-slider') as HTMLInputElement
                                    const input = document.getElementById('terrain-factor-input') as HTMLInputElement
                                    if (slider) slider.value = String(diff)
                                    if (input) input.value = String(diff)
                                }}
                            >
                                <option value="paved">Paved / Road (0%)</option>
                                <option value="dirt">Dirt Road (4%)</option>
                                <option value="double_track">Double Track (8%)</option>
                                <option value="single_track">Single Track (15%)</option>
                                <option value="technical">Technical (30%)</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-neutral-700 block mb-1">Difficulty Factor (%)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    id="terrain-factor-slider"
                                    min="100"
                                    max="200"
                                    defaultValue="100"
                                    className="flex-1 accent-amber-600"
                                    onInput={(e) => {
                                        const val = (e.target as HTMLInputElement).value
                                        const numInput = document.getElementById('terrain-factor-input') as HTMLInputElement
                                        if (numInput) numInput.value = val
                                    }}
                                />
                                <input
                                    type="number"
                                    id="terrain-factor-input"
                                    className="w-14 text-sm border border-neutral-300 rounded p-1 text-right text-neutral-900"
                                    defaultValue="100"
                                    min="100"
                                    max="500"
                                    onChange={(e) => {
                                        const val = e.target.value
                                        const slider = document.getElementById('terrain-factor-slider') as HTMLInputElement
                                        if (slider) slider.value = val
                                    }}
                                />
                                <span className="text-xs text-neutral-500">%</span>
                            </div>
                            <p className="text-[10px] text-neutral-500 mt-1">100% = Normal. 150% = 1.5x slower.</p>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => {
                                    setTerrainSelection({ start: null, end: null })
                                }}
                                className="flex-1 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 rounded border border-neutral-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const typeSelect = document.getElementById('terrain-type-select') as HTMLSelectElement
                                    const factorInput = document.getElementById('terrain-factor-input') as HTMLInputElement

                                    if (onSaveTerrain && terrainSelection.start && terrainSelection.end) {
                                        const s = terrainSelection.start.mile
                                        const e = terrainSelection.end.mile
                                        const min = Math.min(s, e)
                                        const max = Math.max(s, e)

                                        onSaveTerrain(min, max, typeSelect.value, parseInt(factorInput.value))

                                        // CONTINUOUS ADDITION: Set start to the end of this segment
                                        // We need the point object of the END.
                                        // If s < e, end point was 'end'. If s > e, end point was 'start'.
                                        const newStart = s < e ? terrainSelection.end : terrainSelection.start

                                        setTerrainSelection({ start: newStart, end: null })
                                    }
                                }}
                                className="flex-1 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium rounded shadow-sm"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        Mile {highlightMile.toFixed(2)}
                        {highlightElevation !== undefined && highlightElevation !== null && (
                            <> | {Math.round(highlightElevation).toLocaleString()} ft</>
                        )}
                    </>
                ) : (
                    <>{totalDistance ? `${totalDistance.toFixed(2)} miles` : `${viewState.lat.toFixed(4)}, ${viewState.lng.toFixed(4)}`}</>
                )}
            </div>
        </div >
    )
}

function getWaypointIcon(type: string): string {
    switch (type) {
        case 'start': return '🟢'
        case 'finish': return '🏁'
        case 'aid_station': return '➕' // Medical Cross
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
        case 'paved': return '#3b82f6' // blue-500
        case 'dirt': return '#eab308' // yellow-500
        case 'double_track': return '#f97316' // orange-500
        case 'single_track': return '#ef4444' // red-500
        case 'technical': return '#7f1d1d' // red-900 (dark red)
        case 'other': return '#9ca3af' // gray-400
        case 'default': return '#4b5563' // gray-600 (Base Layer)
        default: return '#9ca3af'
    }
}
