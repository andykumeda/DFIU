'use client'

import { useState, useEffect } from 'react'
import { TerrainNode } from '@/types/database'
import styles from '../race/EditRaceModal.module.css' // Reuse consistent styles

interface EditTerrainModalProps {
    node?: Partial<TerrainNode>
    mile?: number
    onClose: () => void
    onSave: (data: Partial<TerrainNode>) => void
    onDelete?: (id: string) => void
}

export function EditTerrainModal({ node, mile, onClose, onSave, onDelete }: EditTerrainModalProps) {
    const [formData, setFormData] = useState<{
        type: TerrainNode['type']
        difficulty: number
        mile: string | number
    }>({
        type: node?.type || 'dirt',
        difficulty: node?.difficulty || 100,
        mile: mile || node?.mile || 0
    })

    useEffect(() => {
        if (node) {
            setFormData(prev => ({
                ...prev,
                type: node.type || 'dirt',
                difficulty: node.difficulty || 100,
                mile: node.mile || mile || 0
            }))
        }
    }, [node, mile])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const parsedMile = typeof formData.mile === 'string' ? parseFloat(formData.mile) : formData.mile
        if (isNaN(parsedMile)) {
            alert('Please enter a valid mile marker')
            return
        }

        onSave({
            ...node,
            ...formData,
            mile: parsedMile
        })
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>{node?.id ? 'Edit Terrain Segment' : 'Add Terrain Change'}</h2>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label>Terrain Type</label>
                        <select
                            value={formData.type}
                            // @ts-ignore
                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                            className={styles.select}
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd' }}
                        >
                            <option value="paved">Paved (Road/Path)</option>
                            <option value="dirt">Dirt (Fire Road/Smooth)</option>
                            <option value="double_track">Double Track</option>
                            <option value="single_track">Single Track</option>
                            <option value="technical">Technical (Rocks/Roots)</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div className={styles.field}>
                        <label>Difficulty Factor ({formData.difficulty}%)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                type="range"
                                min="50"
                                max="200"
                                step="5"
                                value={formData.difficulty}
                                onChange={e => setFormData({ ...formData, difficulty: parseInt(e.target.value) })}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '3rem', textAlign: 'right', fontWeight: 500 }}>
                                {formData.difficulty}%
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                            100% is normal pace. Higher is slower/harder.
                        </p>
                    </div>

                    <div className={styles.field}>
                        <label>End Mile Marker</label>
                        <input
                            type="number"
                            step="0.1"
                            disabled={!!node?.id} // Disable changing mile for existing nodes for now to avoid re-sorting complexity
                            value={formData.mile}
                            onChange={e => setFormData({ ...formData, mile: e.target.value })}
                            style={{ background: node?.id ? '#f5f5f5' : 'white' }}
                        />
                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                            This node marks the END of the segment starting from the previous node.
                        </p>
                    </div>

                    <div className={styles.actions} style={{ justifyContent: 'space-between' }}>
                        {onDelete && node?.id ? (
                            <button
                                type="button"
                                onClick={() => onDelete(node.id!)}
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
