

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Race } from '@/types/database'
import styles from './EditRaceModal.module.css' // We will create this or use inline/global for now if need be, but best to module

interface EditRaceModalProps {
    race: Race
    onClose: () => void
    onUpdate: (updatedRace: Race) => void
}

export function EditRaceModal({ race, onClose, onUpdate }: EditRaceModalProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: race.name,
        location: race.location || '',
        start_datetime: race.start_datetime ? new Date(race.start_datetime).toISOString().slice(0, 16) : '', // yyyy-MM-ddThh:mm
        website_url: race.website_url || '',
        is_public: race.is_public || false
    })

    

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const { data, error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('races') as any)
                .update({
                    name: formData.name,
                    location: formData.location || null,
                    start_datetime: formData.start_datetime ? new Date(formData.start_datetime).toISOString() : null,
                    website_url: formData.website_url || null,
                    is_public: formData.is_public
                })
                .eq('id', race.id)
                .select()
                .single()

            if (error) throw error

            onUpdate(data as Race)
            onClose()
        } catch (error) {
            console.error('Error updating race:', error)
            alert('Failed to update race')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>Edit Race</h2>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.field}>
                        <label>Race Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Location</label>
                        <input
                            type="text"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            placeholder="e.g. San Francisco, CA"
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Date & Time</label>
                        <input
                            type="datetime-local"
                            value={formData.start_datetime}
                            onChange={e => setFormData({ ...formData, start_datetime: e.target.value })}
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Website URL</label>
                        <input
                            type="url"
                            value={formData.website_url}
                            onChange={e => setFormData({ ...formData, website_url: e.target.value })}
                            placeholder="https://..."
                        />
                    </div>

                    <div className={styles.field}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={formData.is_public}
                                onChange={e => setFormData({ ...formData, is_public: e.target.checked })}
                            />
                            Make Public (Visible to everyone)
                        </label>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" onClick={onClose} className={styles.cancelBtn}>Cancel</button>
                        <button type="submit" disabled={isLoading} className={styles.saveBtn}>
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
