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
        const padding = 2

        const points = data.map(d => {
            // Default to minEle if elevation is invalid
            const ele = Number.isFinite(d.elevation) ? d.elevation : minEle
            const x = (d.distance / totalDistance) * (width - padding * 2) + padding
            const y = height - padding - ((ele - minEle) / eleRange) * (height - padding * 2)
            return { x, y }
        })

        // Create SVG path
        const path = points.map((p, i) =>
            i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
        ).join(' ')

        // Create filled area path
        const firstX = points[0]?.x || padding
        const lastX = points[points.length - 1]?.x || width - padding
        const areaPath = `${path} L ${lastX} ${height - padding} L ${firstX} ${height - padding} Z`

        return { path, minEle, maxEle, areaPath }
    }, [data, totalDistance])

    // Compute mile marker positions
    const mileMarkers = useMemo(() => {
        if (!showMileMarkers || totalDistance <= 0) return []
        const markers: number[] = []
        const interval = totalDistance > 100 ? 10 : totalDistance > 50 ? 5 : 1
        for (let mile = interval; mile < totalDistance; mile += interval) {
            markers.push(mile)
        }
        return markers
    }, [showMileMarkers, totalDistance])

    // Compute waypoint positions on the elevation profile
    const waypointPositions = useMemo(() => {
        if (waypoints.length === 0 || data.length === 0 || totalDistance <= 0) return []

        const width = 100
        const padding = 2
        const eleRange = (maxEle - minEle) || 1

        return waypoints.map(wp => {
            const x = (wp.mile / totalDistance) * (width - padding * 2) + padding

            // Find elevation at this mile by interpolation
            let elevation = minEle
            for (let i = 0; i < data.length - 1; i++) {
                if (data[i].distance <= wp.mile && data[i + 1].distance >= wp.mile) {
                    const t = (wp.mile - data[i].distance) / (data[i + 1].distance - data[i].distance)
                    elevation = data[i].elevation + t * (data[i + 1].elevation - data[i].elevation)
                    break
                }
            }
            const y = 100 - padding - ((elevation - minEle) / eleRange) * (100 - padding * 2)

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

    if (data.length === 0) {
        return (
            <div className={`${styles.container} ${className || ''}`}>
                <div className={styles.empty}>No elevation data found in the uploaded route file.</div>
            </div>
        )
    }

    const padding = 2

    return (
        <div className={`${styles.container} ${className || ''}`}>
            <div className={styles.labels}>
                <span className={styles.maxEle}>{Math.round(maxEle).toLocaleString()} ft</span>
                <span className={styles.minEle}>{Math.round(minEle).toLocaleString()} ft</span>
            </div>

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

                {/* Mile markers */}
                {mileMarkers.map(mile => {
                    const x = (mile / totalDistance) * (100 - padding * 2) + padding
                    return (
                        <line
                            key={`mile-${mile}`}
                            x1={x} y1={padding}
                            x2={x} y2={100 - padding}
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth="0.3"
                            vectorEffect="non-scaling-stroke"
                        />
                    )
                })}

                {/* Waypoint markers */}
                {waypointPositions.map((wp, i) => (
                    <line
                        key={`wp-${i}`}
                        x1={wp.x} y1={padding}
                        x2={wp.x} y2={100 - padding}
                        stroke={getWaypointColor(wp.type)}
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="3 2"
                        opacity="0.7"
                    />
                ))}

                {/* Waypoint dots on the line */}
                {waypointPositions.map((wp, i) => (
                    <circle
                        key={`wp-dot-${i}`}
                        cx={wp.x}
                        cy={wp.y}
                        r="1.2"
                        fill={getWaypointColor(wp.type)}
                        stroke="#000"
                        strokeWidth="0.3"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}

                {/* Highlight line */}
                {highlightDistance !== undefined && (
                    <line
                        x1={(highlightDistance / totalDistance) * 96 + 2}
                        y1="2"
                        x2={(highlightDistance / totalDistance) * 96 + 2}
                        y2="98"
                        stroke="#fff"
                        strokeWidth="0.3"
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="2 2"
                    />
                )}
            </svg>

            <div className={styles.xLabels}>
                <span>0 mi</span>
                <span>{Math.round(totalDistance / 2)} mi</span>
                <span>{Math.round(totalDistance)} mi</span>
            </div>
        </div>
    )
}
