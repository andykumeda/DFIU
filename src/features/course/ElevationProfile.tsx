'use client'

import { useMemo, useState, useRef } from 'react'
import styles from './ElevationProfile.module.css'
import {
    getTerrainColor,
    getTerrainLabel,
} from './terrain-constants'

interface WaypointMarker {
    id: string
    mile: number
    name: string
    type: string
}

// ... imports

interface TerrainNode {
    id: string
    mile: number
    type: string
    difficulty?: number
}

interface ElevationProfileProps {
    data: { distance: number; elevation: number }[]
    totalDistance: number
    onHover?: (distance: number | null) => void
    highlightDistance?: number
    highlightedWaypointId?: string | null
    className?: string
    showMileMarkers?: boolean
    waypoints?: WaypointMarker[]
    terrainNodes?: TerrainNode[]
    // Drag-release defines a mile range; parent opens the classification popup.
    onRangeDefined?: (startMile: number, endMile: number) => void
}


export function ElevationProfile({
    data,
    totalDistance,
    onHover,
    highlightDistance,
    highlightedWaypointId,
    className,
    showMileMarkers = false,
    waypoints = [],
    terrainNodes = [],
    onRangeDefined,
}: ElevationProfileProps) {
    const [dragStart, setDragStart] = useState<number | null>(null)
    const [dragEnd, setDragEnd] = useState<number | null>(null)
    const isPainting = !!onRangeDefined
    const dragStartRef = useRef<number | null>(null)

    const snapMile = (mi: number, freeDrag: boolean) => {
        if (freeDrag) return Math.max(0, Math.min(totalDistance, mi))
        const snapped = Math.round(mi * 10) / 10
        return Math.max(0, Math.min(totalDistance, snapped))
    }
    const { segments, minEle, maxEle, areaPath } = useMemo(() => {
        if (!data || data.length === 0) return { segments: [], minEle: 0, maxEle: 0, areaPath: '' }

        const elevations = data
            .map(d => d.elevation)
            .filter(e => Number.isFinite(e))

        if (elevations.length === 0) return { segments: [], minEle: 0, maxEle: 0, areaPath: '' }

        const minEle = Math.min(...elevations)
        const maxEle = Math.max(...elevations)
        const eleRange = maxEle - minEle || 1

        const width = 100
        const height = 100
        const paddingX = 2
        const paddingTop = 25
        const paddingBottom = 5
        const verticalRange = height - paddingTop - paddingBottom

        const points = data.map(d => {
            const ele = Number.isFinite(d.elevation) ? d.elevation : minEle
            const x = (d.distance / totalDistance) * (width - paddingX * 2) + paddingX
            const y = Math.max(paddingTop, height - paddingBottom - ((ele - minEle) / eleRange) * verticalRange)
            return { x, y, distance: d.distance }
        })

        // Sort Terrain Nodes for efficient lookup
        const sortedTerrain = [...(terrainNodes || [])].sort((a, b) => a.mile - b.mile)

        const getTerrainAtMile = (m: number) => {
            if (sortedTerrain.length === 0) return 'default'
            // Find last node <= m
            let active = sortedTerrain[0]
            if (active.mile > m) return 'default' // Before first node

            for (let i = 0; i < sortedTerrain.length; i++) {
                if (sortedTerrain[i].mile <= m) active = sortedTerrain[i]
                else break
            }
            return active.type === 'other' ? 'default' : active.type // Treat 'other' as default/gray in profile?
        }

        const segments: { path: string, color: string }[] = []
        let currentPath = ''
        let currentColor = ''

        // Build segments
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i]
            const p2 = points[i + 1]
            const midDist = (p1.distance + p2.distance) / 2

            // Determine type at midpoint of segment
            let type = getTerrainAtMile(midDist / (totalDistance > 0 ? 1 : 1609.34)) // Data distance is usually miles?
            // Wait, data.distance units? 
            // In RaceDetail/GPX parsing, data is usually miles if totalDistance is passed in miles.
            // Let's assume data.distance is SAME UNIT as totalDistance (miles).

            type = getTerrainAtMile(midDist)

            const color = getTerrainColor(type)

            if (color !== currentColor) {
                // Flash current path
                if (currentPath) {
                    segments.push({ path: currentPath, color: currentColor })
                }
                currentPath = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
                currentColor = color
            } else {
                if (currentPath === '') {
                    currentPath = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
                } else {
                    currentPath += ` L ${p2.x} ${p2.y}`
                }
            }
        }

        if (currentPath) {
            segments.push({ path: currentPath, color: currentColor })
        }

        // Create filled area path (Background)
        // Use full path for area
        const fullPath = points.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(' ')
        const firstX = points[0]?.x || paddingX
        const lastX = points[points.length - 1]?.x || width - paddingX
        const areaPath = `${fullPath} L ${lastX} ${height - paddingBottom} L ${firstX} ${height - paddingBottom} Z`

        return { segments, minEle, maxEle, areaPath }
    }, [data, totalDistance, terrainNodes])

    // Compute mile marker positions on the elevation profile
    const mileMarkerPositions = useMemo(() => {
        if (!showMileMarkers || totalDistance <= 0 || data.length === 0) return []
        const markers: { mile: number; x: number; y: number }[] = []
        // Rule: 5 miles if < 100, 10 miles if >= 100
        const interval = totalDistance >= 100 ? 10 : 5
        const width = 100
        const paddingX = 2
        const paddingTop = 25
        const paddingBottom = 5
        const verticalRange = 100 - paddingTop - paddingBottom
        const eleRange = (maxEle - minEle) || 1

        for (let mile = interval; mile < totalDistance; mile += interval) {
            // Find elevation at this mile by interpolation
            let elevation = minEle
            for (let i = 0; i < data.length - 1; i++) {
                if (data[i].distance <= mile && data[i + 1].distance >= mile) {
                    const t = (mile - data[i].distance) / (data[i + 1].distance - data[i].distance)
                    elevation = data[i].elevation + t * (data[i + 1].elevation - data[i].elevation)
                    break
                }
            }
            const x = (mile / totalDistance) * (width - paddingX * 2) + paddingX
            const y = Math.max(paddingTop, 100 - paddingBottom - ((elevation - minEle) / eleRange) * verticalRange)
            markers.push({ mile, x, y })
        }
        return markers
    }, [showMileMarkers, totalDistance, data, minEle, maxEle])

    // Compute waypoint positions on the elevation profile
    const waypointPositions = useMemo(() => {
        if (!waypoints || waypoints.length === 0 || data.length === 0) return []
        if (totalDistance <= 0) return []

        const width = 100
        const paddingX = 2
        const paddingTop = 25
        const paddingBottom = 5
        const verticalRange = 100 - paddingTop - paddingBottom
        const eleRange = (maxEle - minEle) || 1

        // Create a list of points to render
        return waypoints
            .filter(wp => Number.isFinite(wp.mile) && wp.mile >= 0 && wp.mile <= totalDistance)
            .map(wp => {
                const x = (wp.mile / totalDistance) * (width - paddingX * 2) + paddingX

                // Find elevation at this mile by interpolation
                let elevation = minEle
                for (let i = 0; i < data.length - 1; i++) {
                    if (data[i].distance <= wp.mile && data[i + 1].distance >= wp.mile) {
                        const t = (wp.mile - data[i].distance) / (data[i + 1].distance - data[i].distance)
                        elevation = data[i].elevation + t * (data[i + 1].elevation - data[i].elevation)
                        break
                    }
                }
                const y = Math.max(paddingTop, 100 - paddingBottom - ((elevation - minEle) / eleRange) * verticalRange)

                return { ...wp, x, y, elevation }
            })
    }, [waypoints, data, totalDistance, minEle, maxEle])

    const distanceFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        return (x / rect.width) * totalDistance
    }

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const distance = distanceFromEvent(e)
        if (isPainting && dragStartRef.current !== null) {
            setDragEnd(snapMile(distance, e.shiftKey))
            return
        }
        onHover?.(distance)
    }

    const handleMouseLeave = () => {
        onHover?.(null)
    }

    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!isPainting) return
        e.preventDefault()
        const distance = snapMile(distanceFromEvent(e), e.shiftKey)
        dragStartRef.current = distance
        setDragStart(distance)
        setDragEnd(distance)
    }

    const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!isPainting || dragStartRef.current === null) return
        const start = dragStartRef.current
        const end = snapMile(distanceFromEvent(e), e.shiftKey)
        dragStartRef.current = null
        setDragStart(null)
        setDragEnd(null)
        if (Math.abs(end - start) < 0.05) return // ignore tiny drags
        const lo = Math.min(start, end)
        const hi = Math.max(start, end)
        onRangeDefined?.(lo, hi)
    }

    const cancelDrag = () => {
        dragStartRef.current = null
        setDragStart(null)
        setDragEnd(null)
    }

    const terrainAtHover = useMemo(() => {
        if (highlightDistance === undefined || highlightDistance === null) return null
        const sorted = [...(terrainNodes || [])].sort((a, b) => a.mile - b.mile)
        if (sorted.length === 0) return null
        if (sorted[0].mile > highlightDistance) return null
        let active = sorted[0]
        let endMile = totalDistance
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].mile <= highlightDistance) {
                active = sorted[i]
            } else {
                endMile = sorted[i].mile
                break
            }
        }
        return {
            startMile: active.mile,
            endMile,
            type: active.type,
            difficulty: active.difficulty ?? 100,
        }
    }, [highlightDistance, terrainNodes, totalDistance])

    // Find elevation at highlight distance
    const highlightPoint = useMemo(() => {
        if (highlightDistance === undefined || data.length === 0) return null
        const paddingX = 2
        const paddingTop = 25
        const paddingBottom = 5
        const verticalRange = 100 - paddingTop - paddingBottom
        const width = 100
        const eleRange = (maxEle - minEle) || 1

        // Find elevation by interpolation
        let elevation = minEle
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i].distance <= highlightDistance && data[i + 1].distance >= highlightDistance) {
                const t = (highlightDistance - data[i].distance) / (data[i + 1].distance - data[i].distance)
                elevation = data[i].elevation + t * (data[i + 1].elevation - data[i].elevation)
                break
            }
        }

        const x = (highlightDistance / totalDistance) * (width - paddingX * 2) + paddingX
        const y = Math.max(paddingTop, 100 - paddingBottom - ((elevation - minEle) / eleRange) * verticalRange)
        return { x, y }
    }, [highlightDistance, data, totalDistance, minEle, maxEle])

    if (data.length === 0) {
        return (
            <div className={`${styles.container} ${className || ''}`}>
                <div className={styles.empty}>No elevation data found in the uploaded route file.</div>
            </div>
        )
    }

    return (
        <div className={`${styles.container} ${className || ''}`}>
            <div className={styles.labels}>
                <span className={styles.maxEle}>{Math.round(maxEle).toLocaleString()} ft</span>
                <span className={styles.minEle}>{Math.round(minEle).toLocaleString()} ft</span>
            </div>

            <div className={styles.chartContainer}>
                <svg
                    className={styles.chart}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => { cancelDrag(); handleMouseLeave() }}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    style={isPainting ? { cursor: 'cell' } : undefined}
                >
                    {/* Gradient definition */}
                    <defs>
                        <linearGradient id='colorElevation' x1='0' y1='0' x2='0' y2='1'>
                            <stop offset='5%' stopColor='#f59e0b' stopOpacity={0.3} />
                            <stop offset='95%' stopColor='#f59e0b' stopOpacity={0} />
                        </linearGradient>
                    </defs>

                    {/* Filled area */}
                    <path
                        d={areaPath}
                        fill="url(#colorElevation)"
                        opacity={0.3}
                    />

                    {/* Colored Line Segments */}
                    {segments.map((seg, i) => (
                        <path
                            key={i}
                            d={seg.path}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ))}

                    {/* Brush drag preview */}
                    {isPainting && dragStart !== null && dragEnd !== null && totalDistance > 0 && (() => {
                        const lo = Math.min(dragStart, dragEnd)
                        const hi = Math.max(dragStart, dragEnd)
                        const x1 = (lo / totalDistance) * 100
                        const x2 = (hi / totalDistance) * 100
                        return (
                            <rect
                                x={x1}
                                y={0}
                                width={Math.max(0.01, x2 - x1)}
                                height={100}
                                fill="#f59e0b"
                                opacity={0.25}
                                pointerEvents="none"
                            />
                        )
                    })()}
                </svg>

                {/* Marker Overlay */}
                <div className={styles.markerOverlay}>
                    {/* Mile markers */}
                    {mileMarkerPositions.map(m => (
                        <div
                            key={`mile-${m.mile}`}
                            className={styles.mileMarker}
                            style={{ left: `${m.x}%`, top: `${m.y}%` }}
                        >
                            {m.mile}
                        </div>
                    ))}

                    {/* Waypoint markers */}
                    {waypointPositions.map((wp, i) => {
                        let content = '📍'
                        let bg = 'transparent'
                        let color = 'inherit'
                        let fontWeight = 'normal'
                        let fontSize = '10px'
                        let borderRadius = '50%' // Default round

                        // Match CourseMap styling
                        if (wp.type === 'aid_station') {
                            content = '+'
                            bg = '#ef4444' // red-500
                            color = 'white'
                            fontWeight = '800'
                            fontSize = '12px' // Slightly larger for the plus
                            borderRadius = '4px' // Square-ish for aid station? Or keep round? Map uses standard marker shape which is square-ish in CSS maybe?
                            // CourseMap uses styles.marker which is usually a circle or pin. 
                            // Editor's note: Map markers usually circle. Let's stick to circle for consistency unless CourseMap does otherwise.
                            // CourseMap: el.className = styles.marker. 
                        } else {
                            switch (wp.type) {
                                case 'start': content = '🟢'; bg = '#16a34a'; break;
                                case 'finish': content = '🏁'; bg = '#dc2626'; break;
                                case 'water_only': content = '💧'; bg = '#3b82f6'; break;
                                case 'crew': content = '👥'; bg = '#a855f7'; break;
                                case 'pacer': content = '🏃'; bg = '#f59e0b'; break;
                                case 'drop_bag': content = '🎒'; bg = '#10b981'; break;
                                case 'medical': content = '🏥'; bg = '#ef4444'; break;
                                case 'landmark': content = '⛰️'; break;
                                default: content = '📍'; break;
                            }
                        }

                        let zIndex = 30
                        let transformScale = ''

                        if (highlightedWaypointId && wp.id === highlightedWaypointId) {
                            transformScale = 'scale(1.5)'
                            zIndex = 100
                        }

                        return (
                            <div
                                key={`wp-${i}`}
                                className={styles.waypointMarker}
                                style={{
                                    left: `${wp.x}%`,
                                    top: `${wp.y}%`,
                                    backgroundColor: bg,
                                    color: color,
                                    fontWeight: fontWeight,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: zIndex,
                                    width: '16px', // Slightly larger to contain background
                                    height: '16px',
                                    fontSize: fontSize,
                                    transform: `translate(-50%, -50%) ${transformScale}`,
                                    cursor: 'help',
                                    borderRadius: borderRadius, // Use the variable
                                    boxShadow: highlightedWaypointId === wp.id ? '0 0 10px rgba(255,255,255,0.8)' : '0 1px 2px rgba(0,0,0,0.3)',
                                    transition: 'all 0.2s ease-in-out'
                                }}
                                title={`${wp.name} (${wp.type.replace('_', ' ')})`}
                            >
                                {content}
                            </div>
                        )
                    })}

                    {/* Highlight Dot */}
                    {highlightPoint && (
                        <div
                            className={styles.highlightDot}
                            style={{ left: `${highlightPoint.x}%`, top: `${highlightPoint.y}%` }}
                        />
                    )}

                    {/* Active-drag mile range banner */}
                    {isPainting && dragStart !== null && dragEnd !== null && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                background: '#f59e0b',
                                color: 'white',
                                fontSize: 11,
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontWeight: 600,
                                pointerEvents: 'none',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            }}
                        >
                            {`${Math.min(dragStart, dragEnd).toFixed(2)}–${Math.max(dragStart, dragEnd).toFixed(2)} mi`}
                        </div>
                    )}

                    {/* Terrain tooltip (suppressed while actively dragging) */}
                    {!(isPainting && dragStart !== null && dragEnd !== null) && terrainAtHover && terrainAtHover.type !== 'other' && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 4,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0,0,0,0.75)',
                                color: 'white',
                                fontSize: 11,
                                padding: '3px 8px',
                                borderRadius: 4,
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                                fontWeight: 500,
                                border: `1px solid ${getTerrainColor(terrainAtHover.type)}`,
                            }}
                        >
                            mi {terrainAtHover.startMile.toFixed(1)}–{terrainAtHover.endMile.toFixed(1)}: {getTerrainLabel(terrainAtHover.type)}
                            {terrainAtHover.difficulty !== 100 && ` (${terrainAtHover.difficulty - 100 >= 0 ? '+' : ''}${terrainAtHover.difficulty - 100}%)`}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.xLabels}>
                <span>0 mi</span>
                <span>{Math.round(totalDistance / 2)} mi</span>
                <span>{Math.round(totalDistance)} mi</span>
            </div>
        </div>
    )
}
