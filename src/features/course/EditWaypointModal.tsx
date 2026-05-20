'use client'

import { useState, useEffect } from 'react'
import { Waypoint } from '@/types/database'
import styles from '../race/EditRaceModal.module.css' // Reuse consistent styles

interface EditWaypointModalProps {
    waypoint?: Partial<Waypoint> // If undefined, it's a new waypoint
    lat?: number // For new waypoints
    lon?: number // For new waypoints
    mile?: number // Calculated or existing

    raceDate?: string | null // NEW: For default cutoff date
    timeZone?: string // NEW: For formatting cutoff time
    onClose: () => void
    onSave: (data: Partial<Waypoint>) => void
    onDelete?: (id: string) => void
}

export function EditWaypointModal({ waypoint, lat, lon, mile, raceDate, timeZone, onClose, onSave, onDelete }: EditWaypointModalProps) {
    const [formData, setFormData] = useState<{
        name: string
        type: string
        cutoffDate: string
        cutoffTime: string
        has_drop_bag: boolean
        crew_allowed: boolean
        pacer_allowed: boolean
        notes: string
        crew_relay_notes: string
        runner_next_leg_notes: string
        mile: string | number
        delay: string | number // Minutes
    }>({
        name: waypoint?.name || '',
        type: waypoint?.type || 'aid_station',
        cutoffDate: '',
        cutoffTime: '',
        has_drop_bag: waypoint?.has_drop_bag || false,
        crew_allowed: waypoint?.crew_allowed || false,
        pacer_allowed: waypoint?.pacer_allowed || false,
        notes: waypoint?.notes || '',
        crew_relay_notes: waypoint?.crew_relay_notes || '',
        runner_next_leg_notes: waypoint?.runner_next_leg_notes || '',
        mile: (mile ?? waypoint?.mile ?? 0).toFixed(2),
        delay: waypoint?.delay ?? (waypoint?.type === 'aid_station' || (!waypoint && true) ? 2 : 0)
    })

    useEffect(() => {
        if (waypoint || raceDate) { // Run if waypoint OR raceDate changes (init)
            let cDate = ''
            let cTime = ''

            // 1. Try to parse existing cutoff
            if (waypoint?.cutoff_time && timeZone) {
                try {
                    const date = new Date(waypoint.cutoff_time)
                    if (!isNaN(date.getTime())) {
                        const parts = new Intl.DateTimeFormat('en-CA', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                            timeZone: timeZone
                        }).formatToParts(date)

                        const y = parts.find(p => p.type === 'year')?.value
                        const m = parts.find(p => p.type === 'month')?.value
                        const d = parts.find(p => p.type === 'day')?.value
                        const h = parts.find(p => p.type === 'hour')?.value
                        const min = parts.find(p => p.type === 'minute')?.value

                        if (y && m && d) cDate = `${y}-${m}-${d}`
                        if (h && min) cTime = `${h}:${min}`
                    }
                } catch (e) {
                    console.warn('Error parsing cutoff', e)
                }
            }

            // 2. If no cutoff time (or parse failed), set default DATE to race date
            if (!cDate && raceDate) {
                cDate = raceDate.split('T')[0]
            }

            setFormData(prev => ({
                ...prev,
                // Only update if not already set by user interaction? 
                // Actually useEffect runs on mount mainly.
                name: waypoint?.name || '',
                type: waypoint?.type || 'aid_station',
                cutoffDate: cDate,
                cutoffTime: cTime,
                has_drop_bag: waypoint?.has_drop_bag || false,
                crew_allowed: waypoint?.crew_allowed || false,
                pacer_allowed: waypoint?.pacer_allowed || false,
                notes: waypoint?.notes || '',
                crew_relay_notes: waypoint?.crew_relay_notes || '',
                runner_next_leg_notes: waypoint?.runner_next_leg_notes || '',
                mile: (waypoint?.mile ?? mile ?? 0).toFixed(2),
                delay: waypoint?.delay ?? (waypoint?.type === 'aid_station' ? 2 : 0)
            }))
        }
    }, [waypoint, raceDate, timeZone, mile])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const parsedMile = typeof formData.mile === 'string' ? parseFloat(formData.mile) : formData.mile
        if (isNaN(parsedMile)) {
            alert('Please enter a valid mile marker')
            return
        }

        const roundedMile = Math.round(parsedMile * 100) / 100

        // Combine Date + Time
        let finalCutoffTime = null
        if (formData.cutoffTime) {
            // Must have a date. If empty, fallback to race date or today.
            const datePart = formData.cutoffDate || raceDate?.split('T')[0] || new Date().toISOString().split('T')[0]
            const timePart = formData.cutoffTime
            const localIso = `${datePart}T${timePart}` // No seconds? 

            if (timeZone) {
                try {
                    const { fromZonedTime } = await import('date-fns-tz')
                    const utcDate = fromZonedTime(localIso, timeZone)
                    finalCutoffTime = utcDate.toISOString()
                } catch (e) {
                    console.error("Timezone conversion failed", e)
                    finalCutoffTime = new Date(localIso).toISOString()
                }
            } else {
                finalCutoffTime = new Date(localIso).toISOString()
            }
        }

        onSave({
            ...waypoint,
            ...formData,
            lat: lat ?? waypoint?.lat,
            lon: lon ?? waypoint?.lon,
            mile: roundedMile,
            cutoff_time: finalCutoffTime,
            delay: Number(formData.delay) || 0
        })
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>{waypoint?.id ? 'Edit Waypoint' : 'Add Waypoint'}</h2>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label>Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                            placeholder="e.g. Grouse Gulch"
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Type</label>
                        <select
                            value={formData.type}
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            className={styles.select}
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
                        >
                            <option value="aid_station">Aid Station</option>
                            <option value="water_only">Water Only</option>
                            <option value="crew">Crew Access</option>
                            <option value="pacer">Pacer Exchange</option>
                            <option value="drop_bag">Drop Bag</option>
                            <option value="landmark">Landmark</option>
                            <option value="start">Start</option>
                            <option value="finish">Finish</option>
                        </select>
                    </div>

                    <div className={styles.row}>
                        <div className={styles.field} style={{ flex: 1 }}>
                            <label>Mile Marker</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.mile}
                                onChange={e => setFormData({ ...formData, mile: e.target.value })}
                            />
                        </div>
                        <div className={styles.field} style={{ flex: 1 }}>
                            <label>Cutoff Time</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={formData.cutoffDate}
                                    onChange={e => setFormData({ ...formData, cutoffDate: e.target.value })}
                                    style={{ flex: 1.5 }}
                                />
                                <input
                                    type="time"
                                    value={formData.cutoffTime}
                                    onChange={e => setFormData({ ...formData, cutoffTime: e.target.value })}
                                    style={{ flex: 1 }}
                                />
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">
                                Leave time blank for no cutoff
                            </div>
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label>Stop Duration (minutes)</label>
                        <input
                            type="number"
                            min="0"
                            value={formData.delay}
                            onChange={e => setFormData({ ...formData, delay: e.target.value })}
                            placeholder="0"
                        />
                    </div>

                    <div className={styles.checkboxGroup} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={formData.has_drop_bag}
                                onChange={e => setFormData({ ...formData, has_drop_bag: e.target.checked })}
                            />
                            Drop Bag
                        </label>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={formData.crew_allowed}
                                onChange={e => setFormData({ ...formData, crew_allowed: e.target.checked })}
                            />
                            Crew Access
                        </label>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={formData.pacer_allowed}
                                onChange={e => setFormData({ ...formData, pacer_allowed: e.target.checked })}
                            />
                            Pacer Pickup
                        </label>
                    </div>

                    <div className={styles.field}>
                        <label>Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            rows={3}
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Crew Relay Notes</label>
                        <textarea
                            value={formData.crew_relay_notes}
                            onChange={e => setFormData({ ...formData, crew_relay_notes: e.target.value })}
                            rows={3}
                            placeholder="What crew should tell the runner at this aid station"
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Runner Next-Leg Notes</label>
                        <textarea
                            value={formData.runner_next_leg_notes}
                            onChange={e => setFormData({ ...formData, runner_next_leg_notes: e.target.value })}
                            rows={3}
                            placeholder="What the runner should expect between this aid station and the next"
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                        />
                    </div>

                    <div className={styles.actions} style={{ justifyContent: 'space-between' }}>
                        {onDelete && waypoint?.id ? (
                            <button
                                type="button"
                                onClick={() => onDelete(waypoint.id!)}
                                style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Delete
                            </button>
                        ) : <div></div>}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
                            <button type="submit" className={styles.saveBtn}>Save</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
