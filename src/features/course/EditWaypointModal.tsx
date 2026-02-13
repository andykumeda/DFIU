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
    onClose: () => void
    onSave: (data: Partial<Waypoint>) => void
    onDelete?: (id: string) => void
}

export function EditWaypointModal({ waypoint, lat, lon, mile, raceDate, onClose, onSave, onDelete }: EditWaypointModalProps) {
    const [formData, setFormData] = useState<{
        name: string
        type: string
        cutoff_time: string
        has_drop_bag: boolean
        crew_allowed: boolean
        pacer_allowed: boolean
        notes: string
        mile: string | number
    }>({
        name: waypoint?.name || '',
        type: waypoint?.type || 'aid_station',
        // Default to race start date if no cutoff exists
        cutoff_time: waypoint?.cutoff_time || (raceDate ? new Date(raceDate).toISOString().slice(0, 10) + 'T00:00' : ''),
        has_drop_bag: waypoint?.has_drop_bag || false,
        crew_allowed: waypoint?.crew_allowed || false,
        pacer_allowed: waypoint?.pacer_allowed || false,
        notes: waypoint?.notes || '',
        mile: (mile ?? waypoint?.mile ?? 0).toFixed(2)
    })

    useEffect(() => {
        if (waypoint) {
            setFormData(prev => ({
                ...prev,
                name: waypoint.name || '',
                type: waypoint.type || 'aid_station',
                cutoff_time: waypoint.cutoff_time || (raceDate && !waypoint.cutoff_time ? new Date(raceDate).toISOString().slice(0, 10) + 'T00:00' : prev.cutoff_time),
                has_drop_bag: waypoint.has_drop_bag || false,
                crew_allowed: waypoint.crew_allowed || false,
                pacer_allowed: waypoint.pacer_allowed || false,
                notes: waypoint.notes || '',
                mile: (waypoint.mile ?? 0).toFixed(2)
            }))
        }
    }, [waypoint, raceDate])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const parsedMile = typeof formData.mile === 'string' ? parseFloat(formData.mile) : formData.mile
        if (isNaN(parsedMile)) {
            alert('Please enter a valid mile marker')
            return
        }

        // Round mile to 2 decimal places
        const roundedMile = Math.round(parsedMile * 100) / 100

        onSave({
            ...waypoint,
            ...formData,
            lat: lat ?? waypoint?.lat,
            lon: lon ?? waypoint?.lon,
            mile: roundedMile // Use rounded mile
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
                            <input
                                type="datetime-local"
                                value={formData.cutoff_time}
                                onChange={e => setFormData({ ...formData, cutoff_time: e.target.value })}
                            />
                        </div>
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
