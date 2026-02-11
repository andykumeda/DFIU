'use client'

import { useMemo } from 'react'
import styles from './ElevationProfile.module.css'

interface WaypointMarker {
    mile: number
    name: string
    type: string
}

interface ElevationProfileProps {
    data: { distance: number; elevation: number }[]
    totalDistance: number
    onHover?: (distance: number | null) => void
    highlightDistance?: number
    className?: string
    showMileMarkers?: boolean
    waypoints?: WaypointMarker[]
}

function getWaypointColor(type: string): string {
    switch (type) {
        case 'start': return '#22c55e'
        case 'finish': return '#ef4444'
        case 'aid_station': return '#3b82f6'
        case 'water_source': return '#06b6d4'
        case 'crew_access': return '#a855f7'
        case 'drop_bag': return '#f97316'
        default: return '#eab308'
    }
}

export function ElevationProfile({
    data,
    totalDistance,
    onHover,
    highlightDistance,
    className,
    showMileMarkers = false,
    waypoints = []
}: ElevationProfileProps) {
    const { path, minEle, maxEle, areaPath } = useMemo(() => {
        if (!data || data.length === 0) return { path: '', minEle: 0, maxEle: 0, areaPath: '' }

        const elevations = data
            .map(d => d.elevation)
            .filter(e => Number.isFinite(e))

        if (elevations.length === 0) return { path: '', minEle: 0, maxEle: 0, areaPath: '' }

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
            // Default to minEle if elevation is invalid
            const ele = Number.isFinite(d.elevation) ? d.elevation : minEle
            const x = (d.distance / totalDistance) * (width - paddingX * 2) + paddingX
            const y = Math.max(paddingTop, height - paddingBottom - ((ele - minEle) / eleRange) * verticalRange)
            return { x, y }
        })

        // Create SVG path
        const path = points.map((p, i) =>
            i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
        ).join(' ')

        // Create filled area path
        const firstX = points[0]?.x || paddingX
        const lastX = points[points.length - 1]?.x || width - paddingX
        const areaPath = `${path} L ${lastX} ${height - paddingBottom} L ${firstX} ${height - paddingBottom} Z`

        return { path, minEle, maxEle, areaPath }
    }, [data, totalDistance])

    // Compute mile marker positions on the elevation profile
    const mileMarkerPositions = useMemo(() => {
        if (!showMileMarkers || totalDistance <= 0 || data.length === 0) return []
        const markers: { mile: number; x: number; y: number }[] = []
        const interval = totalDistance > 100 ? 10 : totalDistance > 50 ? 5 : 1
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
        if (waypoints.length === 0 || data.length === 0 || totalDistance <= 0) return []

        const width = 100
        const paddingX = 2
        const paddingTop = 25
        const paddingBottom = 5
        const verticalRange = 100 - paddingTop - paddingBottom
        const eleRange = (maxEle - minEle) || 1

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

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!onHover) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const distance = (x / rect.width) * totalDistance
        onHover(distance)
    }

    const handleMouseLeave = () => {
        onHover?.(null)
    }

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
                    onMouseLeave={handleMouseLeave}
                >
                    {/* Gradient definition */}
                    <defs>
                        <linearGradient id="elevationGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(0, 112, 243, 0.4)" />
                            <stop offset="100%" stopColor="rgba(0, 112, 243, 0.05)" />
                        </linearGradient>
                    </defs>

                    {/* Filled area */}
                    <path
                        d={areaPath}
                        fill="url(#elevationGradient)"
                    />

                    {/* Line */}
                    <path
                        d={path}
                        fill="none"
                        stroke="#0070f3"
                        strokeWidth="0.5"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>

                {/* Marker Overlay - Using HTML for non-stretching symbols */}
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
                    {waypointPositions.map((wp, i) => (
                        <div
                            key={`wp-${i}`}
                            className={styles.waypointMarker}
                            style={{
                                left: `${wp.x}%`,
                                top: `${wp.y}%`,
                                backgroundColor: getWaypointColor(wp.type)
                            }}
                            title={wp.name}
                        />
                    ))}

                    {/* Highlight Dot */}
                    {highlightPoint && (
                        <div
                            className={styles.highlightDot}
                            style={{ left: `${highlightPoint.x}%`, top: `${highlightPoint.y}%` }}
                        />
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
