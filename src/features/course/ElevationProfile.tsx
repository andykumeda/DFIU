'use client'

import { useMemo } from 'react'
import styles from './ElevationProfile.module.css'

interface ElevationProfileProps {
    data: { distance: number; elevation: number }[]
    totalDistance: number
    onHover?: (distance: number | null) => void
    highlightDistance?: number
    className?: string
}

export function ElevationProfile({
    data,
    totalDistance,
    onHover,
    highlightDistance,
    className
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
                <div className={styles.empty}>No elevation data available</div>
            </div>
        )
    }

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
