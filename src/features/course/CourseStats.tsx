'use client'

import styles from './CourseStats.module.css'

interface CourseStatsProps {
    totalDistanceMiles: number
    totalElevationGainFt: number
    totalElevationLossFt: number
    minElevationFt: number
    maxElevationFt: number
}

export function CourseStats({
    totalDistanceMiles,
    totalElevationGainFt,
    totalElevationLossFt,
    minElevationFt,
    maxElevationFt
}: CourseStatsProps) {
    const formatVal = (val: number | null | undefined, suffix: string = '') => {
        if (val === null || val === undefined || !Number.isFinite(val)) return '--'
        // For distance (miles), use 1 decimal. For feet, integer.
        if (suffix.includes('Miles')) return val.toFixed(1)
        return val.toLocaleString(undefined, { maximumFractionDigits: 0 })
    }

    return (
        <div className={styles.container}>
            <div className={styles.stat}>
                <span className={styles.value}>{formatVal(totalDistanceMiles, 'Miles')}</span>
                <span className={styles.label}>Miles</span>
            </div>
            <div className={styles.stat}>
                <span className={styles.value}>{formatVal(totalElevationGainFt)}</span>
                <span className={styles.label}>↑ Gain (ft)</span>
            </div>
            <div className={styles.stat}>
                <span className={styles.value}>{formatVal(totalElevationLossFt)}</span>
                <span className={styles.label}>↓ Loss (ft)</span>
            </div>
            <div className={styles.stat}>
                <span className={styles.value}>{formatVal(maxElevationFt)}</span>
                <span className={styles.label}>High Point (ft)</span>
            </div>
            <div className={styles.stat}>
                <span className={styles.value}>{formatVal(minElevationFt)}</span>
                <span className={styles.label}>Low Point (ft)</span>
            </div>
        </div>
    )
}
