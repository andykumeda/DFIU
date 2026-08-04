

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Race } from '@/types/database'
import type { RaceShareSettings } from '@/lib/race-select'
import { RACE_SELECT } from '@/lib/race-select'
import { buildShareLink, createShareToken } from './share-link'
import { useDemoMode } from '@/features/demo/DemoModeContext'
import { useDemoRacePersist } from '@/features/demo/useDemoRacePersist'
import styles from './EditRaceModal.module.css' // We will create this or use inline/global for now if need be, but best to module

interface EditRaceModalProps {
    race: Race
    onClose: () => void
    onUpdate: (updatedRace: Race) => void
    onDelete?: () => void | Promise<void>
}

export function EditRaceModal({ race, onClose, onUpdate, onDelete }: EditRaceModalProps) {
    const { isDemoMode } = useDemoMode()
    const { saveRacePatch } = useDemoRacePersist(race.id)
    const [isLoading, setIsLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [shareToken, setShareToken] = useState(race.public_share_token || '')
    const [copiedShareLink, setCopiedShareLink] = useState(false)
    const [formData, setFormData] = useState({
        name: race.name,
        location: race.location || '',
        start_datetime: race.start_datetime ? (() => {
            const date = new Date(race.start_datetime)
            const offset = date.getTimezoneOffset()
            const localDate = new Date(date.getTime() - (offset * 60000))
            return localDate.toISOString().slice(0, 16)
        })() : '',
        website_url: race.website_url || '',
        is_public: race.is_public || false,
        public_share_enabled: race.public_share_enabled || false,
        registration_url: race.registration_url || '',
        avg_temp_high: race.avg_temp_high || '',
        avg_temp_low: race.avg_temp_low || '',
        precip_chance: race.precip_chance || '',
        weather_notes: race.weather_notes || '',
        moon_phase: race.moon_phase || '',
        sunrise_time: race.sunrise_time || '',
        sunset_time: race.sunset_time || '',
        overall_cutoff: race.overall_cutoff || '',
        course_record_male: race.course_record_male || '',
        course_record_female: race.course_record_female || '',
        qualifies_for: race.qualifies_for || '',
        course_type: race.course_type || '',
        terrain_type: race.terrain_type || 'trail'
    })

    const [savedShareToken, setSavedShareToken] = useState(race.public_share_token || '')
    const [savedShareEnabled, setSavedShareEnabled] = useState(race.public_share_enabled || false)

    useEffect(() => {
        if (isDemoMode) return
        let cancelled = false
        ;(async () => {
            const { data, error } = await supabase.rpc('get_race_share_settings', { rid: race.id })
            if (cancelled || error) return
            const row = (Array.isArray(data) ? data[0] : data) as RaceShareSettings | null
            if (!row) return
            setShareToken(row.public_share_token || '')
            setSavedShareToken(row.public_share_token || '')
            setSavedShareEnabled(row.public_share_enabled || false)
            setFormData((prev) => ({
                ...prev,
                public_share_enabled: row.public_share_enabled || false,
            }))
        })()
        return () => { cancelled = true }
    }, [race.id, isDemoMode])

    const shareLink = !isDemoMode && formData.public_share_enabled && shareToken ? buildShareLink(race.id, shareToken) : ''
    const shareLinkNeedsSave = !isDemoMode && formData.public_share_enabled && (
        !savedShareEnabled ||
        shareToken !== savedShareToken
    )



    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const racePatch = {
                name: formData.name,
                location: formData.location || null,
                start_datetime: formData.start_datetime ? new Date(formData.start_datetime).toISOString() : null,
                website_url: formData.website_url || null,
                is_public: isDemoMode ? false : formData.is_public,
                public_share_enabled: isDemoMode ? false : formData.public_share_enabled,
                registration_url: formData.registration_url || null,
                avg_temp_high: formData.avg_temp_high || null,
                avg_temp_low: formData.avg_temp_low || null,
                precip_chance: formData.precip_chance || null,
                weather_notes: formData.weather_notes || null,
                moon_phase: formData.moon_phase || null,
                sunrise_time: formData.sunrise_time || null,
                sunset_time: formData.sunset_time || null,
                overall_cutoff: formData.overall_cutoff || null,
                course_record_male: formData.course_record_male || null,
                course_record_female: formData.course_record_female || null,
                qualifies_for: formData.qualifies_for || null,
                course_type: formData.course_type || null,
                terrain_type: formData.terrain_type || 'trail'
            }

            if (isDemoMode) {
                await saveRacePatch(racePatch)
                onUpdate({ ...race, ...racePatch })
                onClose()
                return
            }

            const nextShareToken = formData.public_share_enabled
                ? shareToken || createShareToken()
                : null
            if (nextShareToken && nextShareToken !== shareToken) {
                setShareToken(nextShareToken)
            }

            const { data, error } = await (supabase
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .from('races') as any)
                .update({
                    ...racePatch,
                    public_share_token: nextShareToken,
                })
                .eq('id', race.id)
                .select(RACE_SELECT)
                .single()

            if (error) throw error

            onUpdate({
                ...(data as Race),
                public_share_token: nextShareToken,
            })
            onClose()
        } catch (error) {
            console.error('Error updating race:', error)
            alert('Failed to update race')
        } finally {
            setIsLoading(false)
        }
    }

    const handleShareEnabledChange = (enabled: boolean) => {
        setFormData({ ...formData, public_share_enabled: enabled })
        setCopiedShareLink(false)
        if (enabled && !shareToken) setShareToken(createShareToken())
    }

    const handleCopyShareLink = async () => {
        if (!shareLink) return
        try {
            await navigator.clipboard.writeText(shareLink)
            setCopiedShareLink(true)
            window.setTimeout(() => setCopiedShareLink(false), 2000)
        } catch {
            window.prompt('Copy read-only share link:', shareLink)
        }
    }

    const handleDelete = async () => {
        if (!onDelete) return
        if (!confirm('Are you sure you want to delete this race? This cannot be undone.')) return

        setIsDeleting(true)
        try {
            await onDelete()
        } finally {
            setIsDeleting(false)
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
                        <label>Start</label>
                        <input
                            type="datetime-local"
                            value={formData.start_datetime}
                            onChange={e => setFormData({ ...formData, start_datetime: e.target.value })}
                        />
                    </div>


                    <div className={styles.sectionHeader}>Links</div>
                    <div className={styles.row}>
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
                            <label>Registration URL</label>
                            <input
                                type="url"
                                value={formData.registration_url}
                                onChange={e => setFormData({ ...formData, registration_url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div className={styles.sectionHeader}>Race Stats</div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Terrain Type</label>
                            <select
                                value={formData.terrain_type}
                                onChange={e => setFormData({ ...formData, terrain_type: e.target.value })}
                                style={{ padding: '0.5rem', borderRadius: '4px', background: '#333', color: 'white', border: '1px solid #444' }}
                            >
                                <option value="trail">Trail</option>
                                <option value="road">Road</option>
                                <option value="mixed">Mixed</option>
                                <option value="track">Track</option>
                                <option value="gravel">Gravel</option>
                            </select>
                        </div>
                        <div className={styles.field}>
                            <label>Course Type</label>
                            <input
                                type="text"
                                value={formData.course_type}
                                onChange={e => setFormData({ ...formData, course_type: e.target.value })}
                                placeholder="e.g. Loop, Point-to-Point"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Overall Cutoff</label>
                            <input
                                type="text"
                                value={formData.overall_cutoff}
                                onChange={e => setFormData({ ...formData, overall_cutoff: e.target.value })}
                                placeholder="e.g. 30 hours"
                            />
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Male Record</label>
                            <input
                                type="text"
                                value={formData.course_record_male}
                                onChange={e => setFormData({ ...formData, course_record_male: e.target.value })}
                                placeholder="e.g. 14:30:00 (Runner Name)"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Female Record</label>
                            <input
                                type="text"
                                value={formData.course_record_female}
                                onChange={e => setFormData({ ...formData, course_record_female: e.target.value })}
                                placeholder="e.g. 16:45:00 (Runner Name)"
                            />
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label>Qualifies For</label>
                        <input
                            type="text"
                            value={formData.qualifies_for}
                            onChange={e => setFormData({ ...formData, qualifies_for: e.target.value })}
                            placeholder="e.g. Western States, UTMB"
                        />
                    </div>

                    <div className={styles.sectionHeader}>Weather & Conditions</div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Avg High</label>
                            <input
                                type="text"
                                value={formData.avg_temp_high}
                                onChange={e => setFormData({ ...formData, avg_temp_high: e.target.value })}
                                placeholder="e.g. 75°F"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Avg Low</label>
                            <input
                                type="text"
                                value={formData.avg_temp_low}
                                onChange={e => setFormData({ ...formData, avg_temp_low: e.target.value })}
                                placeholder="e.g. 45°F"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Precip Chance</label>
                            <input
                                type="text"
                                value={formData.precip_chance}
                                onChange={e => setFormData({ ...formData, precip_chance: e.target.value })}
                                placeholder="e.g. 10%"
                            />
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.field}>
                            <label>Sunrise</label>
                            <input
                                type="text"
                                value={formData.sunrise_time}
                                onChange={e => setFormData({ ...formData, sunrise_time: e.target.value })}
                                placeholder="e.g. 6:30 AM"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Sunset</label>
                            <input
                                type="text"
                                value={formData.sunset_time}
                                onChange={e => setFormData({ ...formData, sunset_time: e.target.value })}
                                placeholder="e.g. 8:00 PM"
                            />
                        </div>
                        <div className={styles.field}>
                            <label>Moon Phase</label>
                            <input
                                type="text"
                                value={formData.moon_phase}
                                onChange={e => setFormData({ ...formData, moon_phase: e.target.value })}
                                placeholder="e.g. Full Moon"
                            />
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label>Weather Notes</label>
                        <textarea
                            value={formData.weather_notes}
                            onChange={e => setFormData({ ...formData, weather_notes: e.target.value })}
                            placeholder="Additional weather info..."
                            rows={2}
                        />
                    </div>

                    <div className={styles.sectionHeader}>Access</div>
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
                    <div className={styles.shareBox}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={formData.public_share_enabled}
                                onChange={e => handleShareEnabledChange(e.target.checked)}
                            />
                            Anyone with the link can view read-only
                        </label>
                        <p className={styles.helpText}>
                            Keeps the event out of Public Events, but allows the exact link to open the race plan without edit access.
                        </p>
                        {shareLink && (
                            <div className={styles.shareLinkControls}>
                                <input
                                    type="text"
                                    value={shareLink}
                                    readOnly
                                    aria-label="Read-only share link"
                                />
                                <button
                                    type="button"
                                    onClick={handleCopyShareLink}
                                    disabled={shareLinkNeedsSave}
                                    className={styles.copyBtn}
                                >
                                    {copiedShareLink ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        )}
                        {shareLinkNeedsSave && (
                            <p className={styles.helpText}>Save changes before sharing this link.</p>
                        )}
                    </div>

                    <div className={styles.actions} style={{ justifyContent: 'space-between' }}>
                        {onDelete && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isLoading || isDeleting}
                                style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Race'}
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button type="button" onClick={onClose} disabled={isDeleting} className={styles.cancelBtn}>Cancel</button>
                            <button type="submit" disabled={isLoading || isDeleting} className={styles.saveBtn}>
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
