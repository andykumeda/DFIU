'use client'

import { useState, useEffect } from 'react'
import { Waypoint } from '@/types/database'
import styles from '../race/EditRaceModal.module.css' // Reuse consistent styles

interface EditWaypointModalProps {
    waypoint?: Partial<Waypoint> // If undefined, it's a new waypoint
    lat?: number // For new waypoints
    lon?: number // For new waypoints
    mile?: number // Calculated or existing
    onClose: () => void
    onSave: (data: Partial<Waypoint>) => void
    onDelete?: (id: string) => void
}

export function EditWaypointModal({ waypoint, lat, lon, mile, onClose, onSave, onDelete }: EditWaypointModalProps) {
    const [formData, setFormData] = useState({
        name: waypoint?.name || '',
        type: waypoint?.type || 'aid_station',
        cutoff_time: waypoint?.cutoff_time || '',
        has_drop_bag: waypoint?.has_drop_bag || false,
        crew_allowed: waypoint?.crew_allowed || false,
        pacer_allowed: waypoint?.pacer_allowed || false,
        notes: waypoint?.notes || ''
    })

    useEffect(() => {
        if (waypoint) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData(prev => ({
                ...prev,
                name: waypoint.name || '',
                type: waypoint.type || 'aid_station',
                cutoff_time: waypoint.cutoff_time || '',
                has_drop_bag: waypoint.has_drop_bag || false,
                crew_allowed: waypoint.crew_allowed || false,
                pacer_allowed: waypoint.pacer_allowed || false,
                notes: waypoint.notes || ''
            }))
        }
    }, [waypoint])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave({
            ...waypoint,
            ...formData,
            lat: lat ?? waypoint?.lat,
            lon: lon ?? waypoint?.lon,
            mile: mile ?? waypoint?.mile
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
                            className={styles.select} // We need to ensure this class exists or allow default
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
                        >
                            <option value="aid_station">Aid Station</option>
                            <option value="water_only">Water Only</option>
                            <option value="landmark">Landmark</option>
                            <option value="start">Start</option>
                            <option value="finish">Finish</option>
                        </select>
                    </div>

                    <div className={styles.row}>
                        {/* We might need to add .row to css or use flex in style */}
                        <div className={styles.field} style={{ flex: 1 }}>
                            <label>Mile Marker</label>
                            <input
                                type="number"
                                step="0.1"
                                value={mile?.toFixed(1) || 0}
                                disabled
                                style={{ background: '#f5f5f5' }}
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
