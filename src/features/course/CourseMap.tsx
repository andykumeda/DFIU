import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import along from '@turf/along'
import length from '@turf/length'
import { lineString } from '@turf/helpers'
import { X, Trash2, MapPin } from 'lucide-react'

import MapStyleSwitcher from './MapStyleSwitcher'
import { getNearestPointOnLine, getDistanceFromStart, getCoordinateAtDistance, getDistanceAtCoordinate } from '@/lib/geo-utils'
import styles from './CourseMap.module.css'
import { getTerrainColor, TERRAIN_TYPES } from './terrain-constants'
import { mapLabelForWaypointGroup } from './waypoint-labels'

type TerrainPoint = { lat: number, lon: number, mile: number }
const TERRAIN_START_PICK_DISTANCE_MILES = 0.5

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
    showWaypointLabels?: boolean
    onToggleMileMarkers?: () => void
    highlightElevation?: number | null
    totalDistance?: number
    highlightedWaypointId?: string | null // New prop
    highlightedTerrainId?: string | null // Highlight terrain node being edited
    activeTerrainRange?: { startMile: number; endMile: number } | null
    // When provided, the map captures two clicks to define a terrain segment.
    // RaceDetail then opens a classification popup.
    onSegmentDefined?: (startMile: number, endMile: number) => void
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
    showWaypointLabels = false,
    onToggleMileMarkers,
    highlightElevation,
    totalDistance,
    highlightedWaypointId,
    highlightedTerrainId,
    activeTerrainRange,
    onSegmentDefined,
}: CourseMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const [mapLoaded, setMapLoaded] = useState(false)
    const [styleLoaded, setStyleLoaded] = useState(false) // Track style loading
    const [selectedPOIType, setSelectedPOIType] = useState<string | null>(null)
    // Terrain segment picking is always-on whenever an onSegmentDefined handler is wired.
    const [isTerrainMode, setIsTerrainMode] = useState(!!onSegmentDefined)
    const [terrainSelection, setTerrainSelection] = useState<{
        start: { lat: number, lon: number, mile: number } | null
        end: { lat: number, lon: number, mile: number } | null
    }>({ start: null, end: null })
    const [isDeleteMode, setIsDeleteMode] = useState(false)
    const [showLandmarks, setShowLandmarks] = useState(true)
    const [viewState, setViewState] = useState({ zoom: 12, lat: 0, lng: 0 })
    const visibleWaypoints = useMemo(
        () => showLandmarks ? waypoints : waypoints.filter(waypoint => waypoint.type !== 'landmark'),
        [showLandmarks, waypoints],
    )

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
    const onMapClickRef = useRef(onMapClick)
    const isTerrainModeRef = useRef(isTerrainMode)
    const terrainSelectionRef = useRef(terrainSelection)
    const onSegmentDefinedRef = useRef(onSegmentDefined)
    const canMoveWaypoints = !!onWaypointMove

    // Sync refs for event listeners
    useEffect(() => { selectedPOITypeRef.current = selectedPOIType }, [selectedPOIType])
    useEffect(() => { isDeleteModeRef.current = isDeleteMode }, [isDeleteMode])
    useEffect(() => { onWaypointClickRef.current = onWaypointClick }, [onWaypointClick])
    useEffect(() => { onWaypointMoveRef.current = onWaypointMove }, [onWaypointMove])
    useEffect(() => { onTerrainNodeClickRef.current = onTerrainNodeClick }, [onTerrainNodeClick])
    useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
    useEffect(() => { isTerrainModeRef.current = isTerrainMode }, [isTerrainMode])
    useEffect(() => { terrainSelectionRef.current = terrainSelection }, [terrainSelection])
    useEffect(() => { onSegmentDefinedRef.current = onSegmentDefined }, [onSegmentDefined])

    // Terrain editing is always active when the parent wires an onSegmentDefined
    // handler (i.e. owner + edit mode). No "T" toggle needed.
    useEffect(() => { setIsTerrainMode(!!onSegmentDefined) }, [onSegmentDefined])

    useEffect(() => {
        if (!onSegmentDefined) setTerrainSelection({ start: null, end: null })
    }, [onSegmentDefined])

    const getRouteGeoJson = useCallback((): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates }
        }]
    }), [coordinates])

    const getTerrainPointFromLngLat = useCallback((lngLat: mapboxgl.LngLat, mileHint?: number, maxDistanceMiles?: number): TerrainPoint | null => {
        const snap = getNearestPointOnLine({ lat: lngLat.lat, lon: lngLat.lng }, coordinates, mileHint)
        if (!snap) return null
        if (maxDistanceMiles !== undefined && snap.distance > maxDistanceMiles) return null

        return {
            lat: snap.lat,
            lon: snap.lon,
            mile: getDistanceFromStart(coordinates, snap.index, { lat: snap.lat, lon: snap.lon })
        }
    }, [coordinates])

    const getTerrainPointAtMile = useCallback((mile: number): TerrainPoint | null => {
        if (coordinates.length === 0) return null
        const coord = getCoordinateAtDistance(getRouteGeoJson(), mile * 1609.34)
        if (!coord) return null
        return { lon: coord[0], lat: coord[1], mile }
    }, [coordinates.length, getRouteGeoJson])

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
            const currentMap = map.current
            // In React's effect cleanup order, dependent cleanups (labels,
            // listeners) can run after this one. Clearing the ref first lets
            // them skip a destroyed Mapbox style instead of calling getLayer.
            map.current = null
            if (currentMap) {
                try {
                    currentMap.remove()
                } catch (error) {
                    console.warn('CourseMap cleanup failed', error)
                }
            }
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
        }
        // A style reload can retain a source while dropping its layer. Mapbox's
        // internal removal path then throws `getOwnLayer` if we assume both exist.
        if (!m.getLayer('route')) {
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


            if (m.getLayer('terrain-segments-highlight')) m.removeLayer('terrain-segments-highlight')
            if (m.getLayer('terrain-segments')) m.removeLayer('terrain-segments')
            if (m.getSource('terrain-segments')) m.removeSource('terrain-segments')

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
                // Courses can revisit the same physical trail. Keep the route-mile
                // hint here so an endpoint such as mile 49.40 does not snap to a
                // later out-and-back visit and visually extend its terrain type.
                const nearest = getNearestPointOnLine({ lat: coord[1], lon: coord[0] }, coordinates, m)
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
                    'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 9, 6]
                }
            })

            // A white outline makes the selected segment unmistakable on every
            // terrain color and basemap, while the colored line remains visible.
            m.addLayer({
                id: 'terrain-segments-highlight',
                type: 'line',
                source: 'terrain-segments',
                filter: ['boolean', ['feature-state', 'selected'], false],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#ffffff',
                    'line-width': 15,
                    'line-gap-width': 9,
                    'line-opacity': 0.95,
                },
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
                    { selected: false }
                )
            }
        }

        // Add new highlight
        if (highlightedTerrainId) {
            if (m.getSource('terrain-segments')) {
                m.setFeatureState(
                    { source: 'terrain-segments', id: highlightedTerrainId },
                    { selected: true }
                )
            }
        }

        lastHighlightedTerrainRef.current = highlightedTerrainId || null
    }, [highlightedTerrainId, mapLoaded, styleLoaded, terrainNodes]) // terrainNodes dep ensures we re-apply if layer rebuilds

    // Click a terrain segment line on the map to select it for editing.
    useEffect(() => {
        if (!map.current || !mapLoaded || !map.current.getLayer('terrain-segments')) return
        const m = map.current

        const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
            e.preventDefault()
            const nodeId = e.features?.[0]?.properties?.nodeId
            if (typeof nodeId === 'string') onTerrainNodeClickRef.current?.(nodeId)
        }
        const handleMouseEnter = () => {
            m.getCanvas().style.cursor = onTerrainNodeClickRef.current ? 'pointer' : ''
        }
        const handleMouseLeave = () => {
            m.getCanvas().style.cursor = ''
        }

        m.on('click', 'terrain-segments', handleClick)
        m.on('mouseenter', 'terrain-segments', handleMouseEnter)
        m.on('mouseleave', 'terrain-segments', handleMouseLeave)

        return () => {
            m.off('click', 'terrain-segments', handleClick)
            m.off('mouseenter', 'terrain-segments', handleMouseEnter)
            m.off('mouseleave', 'terrain-segments', handleMouseLeave)
        }
    }, [mapLoaded, terrainNodes, styleLoaded])

    // Waypoint Markers
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        // Cleanup existing
        markersRef.current.forEach(m => m.remove())
        markersRef.current = []

        if (isTerrainMode) return

        // Group waypoints
        const groups: typeof visibleWaypoints[] = []
        visibleWaypoints.forEach(wp => {
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
            container.style.cursor = canMoveWaypoints ? 'grab' : 'pointer'

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
                if (primaryWp.has_drop_bag || primaryWp.type === 'start' || primaryWp.mile <= 0.01) {
                    const badge = document.createElement('div')
                    badge.className = `${styles.badge} ${styles.badgeBag}`
                    badge.innerHTML = '🎒'
                    badge.style.pointerEvents = 'none'
                    container.appendChild(badge)
                }
            }

            const marker = new mapboxgl.Marker({
                element: container,
                draggable: canMoveWaypoints,
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
                if (!onWaypointMoveRef.current) return
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

                        const nameSpan = document.createElement('span')
                        nameSpan.className = 'font-medium text-neutral-700'
                        nameSpan.textContent = wp.name
                        btn.appendChild(nameSpan)

                        const mileSpan = document.createElement('span')
                        mileSpan.className = 'text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded group-hover:bg-white transition-colors'
                        mileSpan.textContent = `Mi ${wp.mile.toFixed(1)}`
                        btn.appendChild(mileSpan)

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
    }, [visibleWaypoints, mapLoaded, coordinates, terrainNodes, isTerrainMode, highlightedWaypointId, canMoveWaypoints])

    // Waypoint labels for the main Map view. This uses a Mapbox symbol layer
    // so labels do not catch marker clicks and can avoid each other naturally.
    useEffect(() => {
        if (!map.current || !styleLoaded) return

        const m = map.current
        const sourceId = 'waypoint-labels'
        const layerId = 'waypoint-labels-text'
        const removeLabels = () => {
            if (map.current !== m || !m.isStyleLoaded()) return
            if (m.getLayer(layerId)) m.removeLayer(layerId)
            if (m.getSource(sourceId)) m.removeSource(sourceId)
        }

        if (!showWaypointLabels || isTerrainMode || visibleWaypoints.length === 0) {
            removeLabels()
            return
        }

        const groups: typeof visibleWaypoints[] = []
        visibleWaypoints.forEach(wp => {
            const existingGroup = groups.find(g =>
                Math.abs(g[0].lat - wp.lat) < 0.0001 &&
                Math.abs(g[0].lon - wp.lon) < 0.0001
            )
            if (existingGroup) existingGroup.push(wp)
            else groups.push([wp])
        })

        const labelData: GeoJSON.FeatureCollection<GeoJSON.Point, { label: string }> = {
            type: 'FeatureCollection',
            features: groups.map(group => {
                group.sort((a, b) => a.mile - b.mile)
                const primaryWp = group[0]
                const label = mapLabelForWaypointGroup(group.map(wp => wp.name))
                return {
                    type: 'Feature',
                    properties: { label },
                    geometry: {
                        type: 'Point',
                        coordinates: [primaryWp.lon, primaryWp.lat],
                    },
                }
            }),
        }

        if (m.getSource(sourceId)) {
            (m.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(labelData)
            return
        }

        m.addSource(sourceId, { type: 'geojson', data: labelData })
        const layer: mapboxgl.SymbolLayerSpecification = {
            id: layerId,
            type: 'symbol',
            source: sourceId,
            layout: {
                'text-field': ['get', 'label'],
                'text-size': 11,
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-variable-anchor': ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
                'text-radial-offset': 1.55,
                'text-justify': 'auto',
                'text-max-width': 10,
                'text-allow-overlap': false,
                'text-ignore-placement': false,
                'text-optional': true,
            },
            paint: {
                'text-color': '#f8fafc',
                'text-halo-color': '#111827',
                'text-halo-width': 1.4,
                'text-halo-blur': 0.4,
            },
        }
        m.addLayer(layer)

        return removeLabels
    }, [showWaypointLabels, styleLoaded, visibleWaypoints, isTerrainMode])

    // Terrain Selection Visuals (Markers & Line)
    useEffect(() => {
        if (!map.current || !mapLoaded) return

        // Clear existing selection markers
        terrainSelectionMarkersRef.current.forEach(m => m.remove())
        terrainSelectionMarkersRef.current = []

        const m = map.current

        const emptySelection: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
            type: 'FeatureCollection',
            features: []
        }

        const ensureSelectionLayer = () => {
            if (!m.getSource('terrain-selection')) {
                m.addSource('terrain-selection', {
                    type: 'geojson',
                    data: emptySelection
                })
            }
            if (!m.getLayer('terrain-selection-line')) {
                m.addLayer({
                    id: 'terrain-selection-line',
                    type: 'line',
                    source: 'terrain-selection',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#fbbf24',
                        'line-width': 9,
                        'line-opacity': 0.9,
                        'line-dasharray': [1.5, 1.25]
                    }
                })
            }
        }

        ensureSelectionLayer()

        const rangeStart = !terrainSelection.start && activeTerrainRange
            ? getTerrainPointAtMile(activeTerrainRange.startMile)
            : terrainSelection.start
        const rangeEnd = !terrainSelection.end && activeTerrainRange
            ? getTerrainPointAtMile(activeTerrainRange.endMile)
            : terrainSelection.end

        if (isTerrainMode && rangeStart && rangeEnd && coordinates.length > 0) {
            const startIndex = getNearestPointOnLine({ lat: rangeStart.lat, lon: rangeStart.lon }, coordinates)?.index ?? 0
            const endIndex = getNearestPointOnLine({ lat: rangeEnd.lat, lon: rangeEnd.lon }, coordinates)?.index ?? 0

            // Handle different orders
            const minIdx = Math.min(startIndex, endIndex)
            const maxIdx = Math.max(startIndex, endIndex)

            const segmentCoords = coordinates.slice(minIdx, maxIdx + 1)

            const source = m.getSource('terrain-selection') as mapboxgl.GeoJSONSource | undefined
            source?.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: segmentCoords
                    },
                    properties: {}
                }]
            })
        } else {
            const source = m.getSource('terrain-selection') as mapboxgl.GeoJSONSource | undefined
            source?.setData(emptySelection)
        }

        if (isTerrainMode && rangeStart && coordinates.length > 0) {
            const createSelectionMarker = (point: TerrainPoint, type: 'start' | 'end') => {
                const el = document.createElement('div')
                el.style.width = type === 'start' ? '18px' : '14px'
                el.style.height = type === 'start' ? '18px' : '14px'
                el.style.borderRadius = '9999px'
                el.style.background = type === 'start' ? '#ffffff' : '#f59e0b'
                el.style.border = type === 'start' ? '3px solid #f59e0b' : '2px solid #ffffff'
                el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.45)'
                el.style.pointerEvents = 'none'
                el.title = type === 'start' ? 'Segment start' : 'Segment end'

                const marker = new mapboxgl.Marker({ element: el, draggable: false })
                    .setLngLat([point.lon, point.lat])
                    .addTo(m)

                terrainSelectionMarkersRef.current.push(marker)
            }

            createSelectionMarker(rangeStart, 'start')
            if (rangeEnd && Math.abs(rangeEnd.mile - rangeStart.mile) >= 0.02) {
                createSelectionMarker(rangeEnd, 'end')
            }
        }

    }, [isTerrainMode, terrainSelection, activeTerrainRange, mapLoaded, coordinates, getTerrainPointAtMile])

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
            if (isTerrainModeRef.current && !selectedPOITypeRef.current) {
                m.getCanvas().style.cursor = 'crosshair'
            }

            if (
                isTerrainModeRef.current &&
                terrainSelectionRef.current.start
            ) {
                const point = getTerrainPointFromLngLat(e.lngLat)
                if (point) {
                    setTerrainSelection(prev => prev.start ? { ...prev, end: point } : prev)
                }
            }

            if (!onHover) return
            // Calculate distance along route based on cursor position
            // We need a way to project the point onto the line
            // We can use getDistanceAtCoordinate if we have the route geojson
            // But we only have 'coordinates' prop here. We should reconstruct or use useMemo for GeoJSON

            // For efficiency, let's assume we can use the helper with a constructed GeoJSON
            // or pass the GeoJSON source data.
            // Dynamic import to avoid SSR issues if any (but we are client-side)
            const distMeters = getDistanceAtCoordinate(getRouteGeoJson(), e.lngLat.lng, e.lngLat.lat)
            if (distMeters !== null) {
                onHover(distMeters / 1609.34) // Convert to miles
            }
        }

        const onMouseLeave = () => {
            m.getCanvas().style.cursor = ''
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
    }, [mapLoaded, styleLoaded, coordinates, onHover, getTerrainPointFromLngLat, getRouteGeoJson])

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
            if (e.defaultPrevented) return

            // Prevent if clicking on marker (handled by marker element)
            const target = e.originalEvent.target as HTMLElement
            if (target.closest('.mapboxgl-marker')) return

            // Waypoint placement (selected via toolbar) takes precedence over
            // terrain picking — otherwise users couldn't add waypoints in edit mode.
            if (selectedPOITypeRef.current && onMapClickRef.current) {
                onMapClickRef.current(e.lngLat.lat, e.lngLat.lng, selectedPOITypeRef.current)
                setSelectedPOIType(null)
                return
            }

            // Terrain map selection uses ordinary route clicks for start/end.
            // Dragging is left to Mapbox, so map pan remains available.
            if (isTerrainModeRef.current) {
                const point = getTerrainPointFromLngLat(e.lngLat, undefined, TERRAIN_START_PICK_DISTANCE_MILES)
                if (!point) return

                e.preventDefault()
                const start = terrainSelectionRef.current.start
                if (!start) {
                    setTerrainSelection({ start: point, end: null })
                    return
                }

                const lo = Math.min(start.mile, point.mile)
                const hi = Math.max(start.mile, point.mile)
                if (hi - lo >= 0.05) {
                    onSegmentDefinedRef.current?.(lo, hi)
                    setTerrainSelection({ start: null, end: null })
                } else {
                    setTerrainSelection({ start: point, end: null })
                }
                return
            }

            // Edit mode without terrain editor (read-only owner view, e.g. before
            // GPX upload) still routes plain clicks through onMapClick if wired.
            if (onMapClickRef.current) {
                onMapClickRef.current(e.lngLat.lat, e.lngLat.lng)
            }
        }

        map.current.on('click', clickHandler)
        return () => { map.current?.off('click', clickHandler) }
    }, [mapLoaded, onMapClick, coordinates]) // Added coordinates dependency

    return (
        <div className={`${styles.container} ${className || ''}`} style={{ position: 'relative', width: '100%', height: '100%', minHeight: '300px' }}>
            { }
            < MapStyleSwitcher
                currentStyle={mapStyle as any}
                onStyleChange={handleStyleChange as any}
                showMileMarkers={showMileMarkers}
                onToggleMileMarkers={onToggleMileMarkers}
                showLandmarks={showLandmarks}
                onToggleLandmarks={() => setShowLandmarks(current => !current)}
            />

            <div
                ref={mapContainer}
                className={`${styles.map} ${(selectedPOIType || isDeleteMode) ? styles.crosshair : ''}`}
                style={{ width: '100%', height: '100%' }}
            />

            {/* Toolbar — only shown when the parent wired up edit handlers (owner view) */}
            {onMapClick && <div className={styles.toolbar}>
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
            </div>}


            {
                !import.meta.env.VITE_MAPBOX_TOKEN && (
                    <div className={styles.noToken}>
                        <p>Mapbox token not configured</p>
                        <p className={styles.hint}>Add VITE_MAPBOX_TOKEN to .env.local</p>
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

            <div className="absolute bottom-3 left-3 z-10 max-w-[42%] rounded border border-neutral-700/80 bg-neutral-950/85 px-1.5 py-1 text-[9px] leading-tight text-neutral-200 shadow-md backdrop-blur-sm pointer-events-none sm:max-w-none sm:px-2 sm:py-1.5 sm:text-[10px]">
                <div className="mb-0.5 text-[8px] font-semibold uppercase tracking-wide text-neutral-500 sm:text-[9px]">Terrain</div>
                <div className="space-y-0.5">
                    {TERRAIN_TYPES.map(terrain => (
                        <div key={terrain.value} className="flex items-center gap-1 whitespace-nowrap">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-white/25 sm:h-2 sm:w-2" style={{ backgroundColor: terrain.color }} />
                            <span className="truncate">{terrain.label}</span>
                        </div>
                    ))}
                </div>
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
        case 'landmark': return '⛰️'
        default: return '📍'
    }
}
