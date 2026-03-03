'use client'

import { Waypoint } from '@/types/database'
import styles from '../race/EditRaceModal.module.css' // Reuse consistent styles
import { format } from 'date-fns'

interface ViewWaypointModalProps {
    waypoint: Waypoint
    isOwner: boolean
    timeZone?: string
    onClose: () => void
    onEdit?: () => void
}

function getWaypointIcon(type: string): string {
    switch (type) {
        case 'start': return '🟢'
        case 'finish': return '🏁'
        case 'aid_station': return '➕'
        case 'water_only': return '💧'
        case 'crew': return '👥'
        case 'pacer': return '🏃'
        case 'drop_bag': return '🎒'
        case 'medical': return '🏥'
        case 'landmark': return '📸'
        default: return '📍'
    }
}

function formatCutoffTime(utcString: string, timeZone?: string) {
    if (!utcString) return null
    try {
        const date = new Date(utcString)
        if (isNaN(date.getTime())) return null

        // If timeZone is provided, we can use format with tz. But simpler is native Intl
        if (timeZone) {
            return new Intl.DateTimeFormat('en-US', {
                timeZone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            }).format(date)
        }

        return format(date, 'MMM d, h:mm a')
    } catch {
        return null
    }
}

export function ViewWaypointModal({ waypoint, isOwner, timeZone, onClose, onEdit }: ViewWaypointModalProps) {
    const formattedCutoff = waypoint.cutoff_time ? formatCutoffTime(waypoint.cutoff_time, timeZone) : null

    return (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
            <div className={`${styles.modal} max-w-md w-full`}>
                <div className={styles.header}>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl" title={waypoint.type.replace('_', ' ')}>
                            {waypoint.type === 'aid_station' ? (
                                <span className="flex items-center justify-center w-8 h-8 rounded bg-red-500 text-white font-bold text-xl leading-none select-none">+</span>
                            ) : (
                                getWaypointIcon(waypoint.type)
                            )}
                        </span>
                        <h2 className="!mb-0">{waypoint.name}</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-800">
                            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Mile Marker</div>
                            <div className="text-xl font-mono text-white">{waypoint.mile.toFixed(1)}</div>
                        </div>
                        <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-800">
                            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Type</div>
                            <div className="text-lg text-white capitalize">{waypoint.type.replace('_', ' ')}</div>
                        </div>
                    </div>

                    {(formattedCutoff || (waypoint.delay && waypoint.delay > 0)) && (
                        <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-800 space-y-3">
                            {formattedCutoff && (
                                <div>
                                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Cutoff Time</div>
                                    <div className="text-white">{formattedCutoff}</div>
                                </div>
                            )}
                            {(waypoint.delay && waypoint.delay > 0) && (
                                <div>
                                    <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">Expected Stop Duration</div>
                                    <div className="text-white">{waypoint.delay} minutes</div>
                                </div>
                            )}
                        </div>
                    )}

                    {(waypoint.has_drop_bag || waypoint.crew_allowed || waypoint.pacer_allowed) && (
                        <div>
                            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Amenities & Access</div>
                            <div className="flex flex-wrap gap-2">
                                {waypoint.has_drop_bag && (
                                    <span className="bg-neutral-800 text-neutral-300 text-xs px-2.5 py-1 rounded border border-neutral-700 flex items-center gap-1">
                                        🎒 Drop Bag
                                    </span>
                                )}
                                {waypoint.crew_allowed && (
                                    <span className="bg-neutral-800 text-neutral-300 text-xs px-2.5 py-1 rounded border border-neutral-700 flex items-center gap-1">
                                        👥 Crew Access
                                    </span>
                                )}
                                {waypoint.pacer_allowed && (
                                    <span className="bg-neutral-800 text-neutral-300 text-xs px-2.5 py-1 rounded border border-neutral-700 flex items-center gap-1">
                                        🏃 Pacer Pickup
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {waypoint.notes && (
                        <div>
                            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">Notes</div>
                            <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-800 text-neutral-300 whitespace-pre-wrap text-sm">
                                {waypoint.notes}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                        <button type="button" onClick={onClose} className={styles.cancelBtn}>Close</button>
                        {isOwner && onEdit && (
                            <button type="button" onClick={onEdit} className={styles.saveBtn}>Edit Waypoint</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
