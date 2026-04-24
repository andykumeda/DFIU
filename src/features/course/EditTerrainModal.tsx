'use client'

import { useState, useEffect } from 'react'
import { TerrainNode } from '@/types/database'
import styles from '../race/EditRaceModal.module.css' // Reuse consistent styles
import { TERRAIN_TYPES, getTerrainDefaultDifficulty } from './terrain-constants'



export function EditTerrainModal({ node, startMile: initialStartMile, endMile: initialEndMile, onClose, onSave, onDelete }: {
    node?: Partial<TerrainNode>
    startMile?: number
    endMile?: number
    onClose: () => void
    onSave: (startMile: number, endMile: number, type: string, difficulty: number) => void
    onDelete?: (id: string) => void
}) {
    const [formData, setFormData] = useState<{
        type: TerrainNode['type']
        difficulty: number
        startMile: string | number
        endMile: string | number
    }>({
        type: node?.type || 'dirt',
        difficulty: node?.difficulty || 104,
        startMile: node?.mile ?? (initialStartMile || 0),
        endMile: initialEndMile || (node?.mile ? node.mile + 1 : 1)
    })

    useEffect(() => {
        if (node) {
            // eslint-disable-next-line
            setFormData(prev => ({
                ...prev,
                type: node.type || 'dirt',
                difficulty: node.difficulty || 104,
                startMile: node.mile ?? 0,
            }))
        }
        // removing initialEndMile side-effect to avoid cascading renders
    }, [node])

    const handleTypeChange = (newType: string) => {
        setFormData(prev => ({ ...prev, type: newType as any, difficulty: getTerrainDefaultDifficulty(newType) }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const start = typeof formData.startMile === 'string' ? parseFloat(formData.startMile) : formData.startMile
        const end = typeof formData.endMile === 'string' ? parseFloat(formData.endMile) : formData.endMile

        if (isNaN(start) || isNaN(end)) {
            alert('Please enter valid mile markers')
            return
        }

        if (start < 0 || end < 0) {
            alert('Miles cannot be negative')
            return
        }

        if (end <= start) {
            alert('End mile must be greater than start mile')
            return
        }

        onSave(start, end, formData.type, formData.difficulty)
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div>
                        <h2>{node?.id ? 'Edit Terrain Segment' : 'Add Terrain Segment'}</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className="flex gap-4 mb-4">
                        <div className={styles.field} style={{ flex: 1 }}>
                            <label>Start Mile</label>
                            <input
                                type="number"
                                step="0.01"
                                value={typeof formData.startMile === 'number' ? formData.startMile.toFixed(2) : formData.startMile}
                                onChange={e => setFormData({ ...formData, startMile: e.target.value })}
                            />
                        </div>
                        <div className={styles.field} style={{ flex: 1 }}>
                            <label>End Mile</label>
                            <input
                                type="number"
                                step="0.01"
                                value={typeof formData.endMile === 'number' ? formData.endMile.toFixed(2) : formData.endMile}
                                onChange={e => setFormData({ ...formData, endMile: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className={styles.field}>
                        <label>Terrain Type</label>
                        <select
                            value={formData.type}
                            onChange={e => handleTypeChange(e.target.value)}
                            className={styles.select}
                            style={{ padding: '0.75rem', borderRadius: '6px', border: '1px solid #ddd', width: '100%' }}
                        >
                            {TERRAIN_TYPES.map(t => (
                                <option key={t.value} value={t.value}>
                                    {t.label} ({t.defaultDifficulty - 100 >= 0 ? '+' : ''}{t.defaultDifficulty - 100}%)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.field}>
                        <label>Difficulty Adjustment ({formData.difficulty - 100 >= 0 ? '+' : ''}{formData.difficulty - 100}%)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                type="range"
                                min="90"
                                max="150"
                                step="1"
                                value={formData.difficulty}
                                onChange={e => setFormData({ ...formData, difficulty: parseInt(e.target.value) })}
                                style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '3rem', textAlign: 'right', fontWeight: 500 }}>
                                {formData.difficulty - 100}%
                            </span>
                        </div>
                    </div>

                    <div className={styles.actions} style={{ justifyContent: 'space-between', display: 'flex', marginTop: '1.5rem' }}>
                        {onDelete && node?.id ? (
                            <button
                                type="button"
                                onClick={() => onDelete(node.id!)}
                                style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                            >
                                Delete Segment Start
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
