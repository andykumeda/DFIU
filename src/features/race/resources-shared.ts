import { Race } from '@/types/database'
import {
    FileText, Mic, MapPin, Trophy, Camera, Users, Radio, Link as LinkIcon,
    type LucideIcon,
} from 'lucide-react'

export type ResourceIconId =
    | 'file-text' | 'mic' | 'map-pin' | 'trophy' | 'camera' | 'users' | 'radio' | 'link'

export interface ResourceLinkEntry {
    id: string
    label: string
    url: string
    embed_url?: string
    datetime: string | null
    icon: ResourceIconId
    enabled: boolean
    hasDate: boolean
}

export interface ResourcesConfig {
    links: ResourceLinkEntry[]
    lodging_label: string
    lodging_enabled: boolean
    schedule_label: string
    schedule_enabled: boolean
    schedule_info: string
}

export const RESOURCE_ICON_MAP: Record<ResourceIconId, LucideIcon> = {
    'file-text': FileText,
    mic: Mic,
    'map-pin': MapPin,
    trophy: Trophy,
    camera: Camera,
    users: Users,
    radio: Radio,
    link: LinkIcon,
}

const BUILTIN_RESOURCES: Array<{
    id: string
    label: string
    urlKey?: keyof Race
    dateKey?: 'briefing_datetime' | 'packet_pickup_datetime'
    icon: ResourceIconId
}> = [
    { id: 'racebook_url', label: 'Racebook / Guide', urlKey: 'racebook_url', icon: 'file-text' },
    { id: 'briefing_url', label: 'Pre-Race Briefing', urlKey: 'briefing_url', dateKey: 'briefing_datetime', icon: 'mic' },
    { id: 'packet_pickup_url', label: 'Packet Pickup Info', urlKey: 'packet_pickup_url', dateKey: 'packet_pickup_datetime', icon: 'map-pin' },
    { id: 'past_results_url', label: 'Past Results', urlKey: 'past_results_url', icon: 'trophy' },
    { id: 'media_url', label: 'Media / Photos', urlKey: 'media_url', icon: 'camera' },
    { id: 'entrants_url', label: 'Entrants List', urlKey: 'entrants_url', icon: 'users' },
    { id: 'tracking_url', label: 'Live Tracking', urlKey: 'tracking_url', icon: 'radio' },
    { id: 'live_results_url', label: 'Live Results', icon: 'trophy' },
]

export function buildDefaultResourcesConfig(race: Race): ResourcesConfig {
    return {
        links: BUILTIN_RESOURCES.map(def => ({
            id: def.id,
            label: def.label,
            url: def.urlKey ? (race[def.urlKey] as string | null) || '' : '',
            datetime: def.dateKey ? (race[def.dateKey] as string | null) : null,
            icon: def.icon,
            enabled: true,
            hasDate: !!def.dateKey,
        })),
        lodging_label: 'Lodging & Dining Recommendations',
        lodging_enabled: true,
        schedule_label: 'Schedule of Events',
        schedule_enabled: true,
        schedule_info: '',
    }
}

export function parseResourcesConfig(raw: unknown, race: Race): ResourcesConfig {
    const defaults = buildDefaultResourcesConfig(race)
    if (!raw || typeof raw !== 'object') return defaults

    const config = raw as Partial<ResourcesConfig>
    if (!Array.isArray(config.links)) return defaults

    const defaultById = new Map(defaults.links.map(l => [l.id, l]))
    const parsedLinks: ResourceLinkEntry[] = config.links
        .filter((l): l is ResourceLinkEntry =>
            !!l && typeof l === 'object' && typeof (l as ResourceLinkEntry).id === 'string'
        )
        .map(link => {
            const builtin = defaultById.get(link.id)
            return {
                id: link.id,
                label: typeof link.label === 'string' && link.label.trim() ? link.label.trim() : (builtin?.label ?? 'Link'),
                url: typeof link.url === 'string' ? link.url : (builtin?.url ?? ''),
                embed_url: typeof link.embed_url === 'string' ? link.embed_url : '',
                datetime: typeof link.datetime === 'string' ? link.datetime : (builtin?.datetime ?? null),
                icon: (link.icon as ResourceIconId) in RESOURCE_ICON_MAP ? link.icon as ResourceIconId : (builtin?.icon ?? 'link'),
                enabled: typeof link.enabled === 'boolean' ? link.enabled : true,
                hasDate: typeof link.hasDate === 'boolean' ? link.hasDate : (builtin?.hasDate ?? false),
            }
        })

    // Append any built-in links missing from saved config (forward compat).
    for (const def of defaults.links) {
        if (!parsedLinks.some(l => l.id === def.id)) parsedLinks.push({ ...def })
    }

    return {
        links: parsedLinks,
        lodging_label: typeof config.lodging_label === 'string' && config.lodging_label.trim()
            ? config.lodging_label.trim()
            : defaults.lodging_label,
        lodging_enabled: typeof config.lodging_enabled === 'boolean' ? config.lodging_enabled : true,
        schedule_label: typeof config.schedule_label === 'string' && config.schedule_label.trim()
            ? config.schedule_label.trim()
            : defaults.schedule_label,
        schedule_enabled: typeof config.schedule_enabled === 'boolean' ? config.schedule_enabled : true,
        schedule_info: typeof config.schedule_info === 'string' ? config.schedule_info : '',
    }
}

export function resourcesConfigToRacePatch(config: ResourcesConfig): Partial<Race> {
    const patch: Partial<Race> = {}
    for (const link of config.links) {
        if (link.id === 'racebook_url') patch.racebook_url = link.url || null
        else if (link.id === 'briefing_url') {
            patch.briefing_url = link.url || null
            patch.briefing_datetime = link.datetime
        } else if (link.id === 'packet_pickup_url') {
            patch.packet_pickup_url = link.url || null
            patch.packet_pickup_datetime = link.datetime
        } else if (link.id === 'past_results_url') patch.past_results_url = link.url || null
        else if (link.id === 'media_url') patch.media_url = link.url || null
        else if (link.id === 'entrants_url') patch.entrants_url = link.url || null
        else if (link.id === 'tracking_url') patch.tracking_url = link.url || null
    }
    return patch
}
