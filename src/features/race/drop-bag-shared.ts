import type { Waypoint } from '@/types/database'

export type BagKind = 'start' | 'official' | 'crew'

/** Older map-entered drop bag notes may live in general waypoint `notes`. */
export function getDropBagNotes(waypoint: Pick<Waypoint, 'drop_bag_notes' | 'notes'>): string {
    return waypoint.drop_bag_notes || waypoint.notes || ''
}

export function isStartBagWaypoint(waypoint: Pick<Waypoint, 'type' | 'mile'>): boolean {
    return waypoint.type === 'start' || waypoint.mile <= 0.01
}

export function isOfficialDropBagWaypoint(waypoint: Pick<Waypoint, 'type' | 'has_drop_bag'>): boolean {
    return !!waypoint.has_drop_bag || waypoint.type === 'drop_bag'
}

export function isCrewBagCandidateWaypoint(
    waypoint: Pick<Waypoint, 'type' | 'mile' | 'has_drop_bag' | 'crew_allowed'>
): boolean {
    return waypoint.type === 'aid_station' &&
        !!waypoint.crew_allowed &&
        !isStartBagWaypoint(waypoint) &&
        !isOfficialDropBagWaypoint(waypoint)
}

export function hasSavedBagPlan(
    waypoint: Pick<Waypoint, 'drop_bag_items' | 'drop_bag_name' | 'drop_bag_notes'>
): boolean {
    const items = waypoint.drop_bag_items
    return (Array.isArray(items) && items.length > 0) ||
        !!waypoint.drop_bag_name?.trim() ||
        !!waypoint.drop_bag_notes?.trim()
}

export function getBagKind(
    waypoint: Pick<Waypoint, 'type' | 'mile' | 'has_drop_bag' | 'crew_allowed'>
): BagKind | null {
    if (isStartBagWaypoint(waypoint)) return 'start'
    if (isOfficialDropBagWaypoint(waypoint)) return 'official'
    if (isCrewBagCandidateWaypoint(waypoint)) return 'crew'
    return null
}

export function getBagKindLabel(kind: BagKind): string {
    if (kind === 'start') return 'Start Gear'
    if (kind === 'crew') return 'Crew Bag'
    return 'Official Drop Bag'
}

export interface DropBagTemplateItem {
    text: string
    category: string
}

export interface DropBagItem {
    id: string
    text: string
    category: string
    checked: boolean
    quantity?: string
}

export const DROP_BAG_CATEGORIES = [
    { id: 'hydration', label: 'Hydration & Nutrition' },
    { id: 'gear', label: 'Gear & Clothing' },
    { id: 'medical', label: 'Medical & Care' },
    { id: 'conditions', label: 'Condition Specific (Smart)' },
    { id: 'custom', label: 'Custom' },
] as const

export const DEFAULT_DROP_BAG_TEMPLATE: DropBagTemplateItem[] = [
    { text: 'Flasks / Bladder refilled', category: 'hydration' },
    { text: 'Gels / Chews', category: 'hydration' },
    { text: 'Drink Mix / Electrolytes', category: 'hydration' },
    { text: 'Solid Food (Bars, Waffles)', category: 'hydration' },
    { text: 'Fresh Socks', category: 'gear' },
    { text: 'Extra Shoes', category: 'gear' },
    { text: 'Clean Shirt', category: 'gear' },
    { text: 'Chafe Cream', category: 'medical' },
    { text: 'Blister Kit / Tape', category: 'medical' },
    { text: 'Sunscreen', category: 'medical' },
    { text: 'Tissues / Wipes', category: 'medical' },
]

export const DEFAULT_START_BAG_TEMPLATE: DropBagTemplateItem[] = [
    { text: 'Race bib / timing chip', category: 'gear' },
    { text: 'Start bottles / bladder filled', category: 'hydration' },
    { text: 'Start calories / gels', category: 'hydration' },
    { text: 'Phone / watch charged', category: 'gear' },
    { text: 'Sunscreen / anti-chafe applied', category: 'medical' },
    { text: 'Headlamp if starting in the dark', category: 'conditions' },
]

function coerceTemplateArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw
    if (raw && typeof raw === 'object') {
        const candidate = raw as { items?: unknown; template?: unknown; drop_bag_template?: unknown }
        if (Array.isArray(candidate.items)) return candidate.items
        if (Array.isArray(candidate.template)) return candidate.template
        if (Array.isArray(candidate.drop_bag_template)) return candidate.drop_bag_template
    }
    return []
}

function normalizeText(item: Record<string, unknown>): string {
    const text = item.text ?? item.label ?? item.name
    return typeof text === 'string' ? text.trim() : ''
}

export function parseDropBagTemplate(raw: unknown): DropBagTemplateItem[] {
    const templateItems = coerceTemplateArray(raw)
    if (!templateItems.length) return [...DEFAULT_DROP_BAG_TEMPLATE]

    const items = templateItems
        .map((item): DropBagTemplateItem | null => {
            if (!item || typeof item !== 'object') return null
            const itemRecord = item as Record<string, unknown>
            const text = normalizeText(itemRecord)
            if (!text) return null
            const category = typeof itemRecord.category === 'string' && itemRecord.category.trim()
                ? itemRecord.category.trim()
                : 'custom'
            return { text, category }
        })
        .filter((item): item is DropBagTemplateItem => item !== null)
        .filter(item => item.text.length > 0)
    return items.length > 0 ? items : [...DEFAULT_DROP_BAG_TEMPLATE]
}

export function parseDropBagItems(raw: unknown): DropBagItem[] {
    if (!Array.isArray(raw)) return []

    return raw
        .map((item, i): DropBagItem | null => {
            if (!item || typeof item !== 'object') return null
            const itemRecord = item as Record<string, unknown>
            const text = normalizeText(itemRecord)
            if (!text) return null
            const category = typeof itemRecord.category === 'string' && itemRecord.category.trim()
                ? itemRecord.category.trim()
                : 'custom'
            const quantity = itemRecord.quantity ?? itemRecord.qty

            return {
                id: typeof itemRecord.id === 'string' && itemRecord.id.trim()
                    ? itemRecord.id
                    : `saved_${i}`,
                text,
                category,
                checked: itemRecord.checked === true,
                quantity: quantity == null ? undefined : String(quantity),
            }
        })
        .filter((item): item is DropBagItem => item !== null)
}

export function seedDropBagItems(
    template: DropBagTemplateItem[],
    opts: { isNight: boolean; isHot: boolean; isCold: boolean }
): DropBagItem[] {
    const items: DropBagItem[] = template.map((item, i) => ({
        id: `tpl_${i}`,
        text: item.text,
        category: item.category,
        checked: false,
    }))

    if (opts.isNight) {
        items.push(
            { id: 'smart_night_1', text: 'Headlamp', category: 'conditions', checked: false },
            { id: 'smart_night_2', text: 'Backup Batteries/Light', category: 'conditions', checked: false },
            { id: 'smart_night_3', text: 'Reflective Gear', category: 'conditions', checked: false },
        )
    }
    if (opts.isHot) {
        items.push(
            { id: 'smart_hot_1', text: 'Ice Bandana', category: 'conditions', checked: false },
            { id: 'smart_hot_2', text: 'Arm Coolers', category: 'conditions', checked: false },
        )
    }
    if (opts.isCold) {
        items.push(
            { id: 'smart_cold_1', text: 'Warm Gloves', category: 'conditions', checked: false },
            { id: 'smart_cold_2', text: 'Jacket / Windbreaker', category: 'conditions', checked: false },
            { id: 'smart_cold_3', text: 'Beanie / Buff', category: 'conditions', checked: false },
        )
    }

    return items
}

const itemKey = (item: { category: string; text: string }) =>
    `${item.category}::${item.text.trim().toLowerCase()}`

export function getDropBagTemplateForKind(
    kind: BagKind,
    dropBagTemplate: DropBagTemplateItem[]
): DropBagTemplateItem[] {
    if (kind !== 'start') return dropBagTemplate

    const result: DropBagTemplateItem[] = []
    const usedKeys = new Set<string>()

    for (const item of [...dropBagTemplate, ...DEFAULT_START_BAG_TEMPLATE]) {
        const key = itemKey(item)
        if (usedKeys.has(key)) continue
        result.push(item)
        usedKeys.add(key)
    }

    return result
}

// Reconciles the race-level template into a bag's existing items so template
// edits (adds, renames, removals) show up without wiping a runner's progress.
// Standard template categories are driven by the template; smart "conditions"
// items are regenerated from current weather/night; "custom" items are kept.
// Checked state and quantities are preserved for any item that still exists.
export function mergeTemplateIntoItems(
    existing: DropBagItem[],
    template: DropBagTemplateItem[],
    opts: { isNight: boolean; isHot: boolean; isCold: boolean }
): DropBagItem[] {
    const existingByKey = new Map(existing.map(item => [itemKey(item), item]))
    const existingById = new Map(existing.map(item => [item.id, item]))
    const result: DropBagItem[] = []
    const usedKeys = new Set<string>()
    const usedIds = new Set<string>()

    template.forEach((tpl, i) => {
        const key = itemKey(tpl)
        if (usedKeys.has(key)) return
        const templateId = `tpl_${i}`
        const prior = existingByKey.get(key) ?? existingById.get(templateId)
        result.push({
            id: prior?.id ?? templateId,
            text: prior && itemKey(prior) !== key ? prior.text : tpl.text,
            category: tpl.category,
            checked: prior?.checked ?? false,
            quantity: prior?.quantity,
        })
        usedKeys.add(key)
        if (prior) {
            usedKeys.add(itemKey(prior))
            usedIds.add(prior.id)
        }
    })

    for (const conditionItem of seedDropBagItems([], opts)) {
        const key = itemKey(conditionItem)
        if (usedKeys.has(key)) continue
        const prior = existingByKey.get(key) ?? existingById.get(conditionItem.id)
        result.push({
            ...conditionItem,
            text: prior && itemKey(prior) !== key ? prior.text : conditionItem.text,
            checked: prior?.checked ?? conditionItem.checked,
            quantity: prior?.quantity,
        })
        usedKeys.add(key)
        if (prior) {
            usedKeys.add(itemKey(prior))
            usedIds.add(prior.id)
        }
    }

    for (const item of existing) {
        const key = itemKey(item)
        if (usedKeys.has(key) || usedIds.has(item.id)) continue
        if (item.category === 'custom') {
            result.push(item)
            usedKeys.add(key)
            usedIds.add(item.id)
        }
    }

    return result
}

export function getDropBagEditorItems(
    existing: unknown,
    template: DropBagTemplateItem[],
    opts: { isNight: boolean; isHot: boolean; isCold: boolean }
): DropBagItem[] {
    const existingItems = parseDropBagItems(existing)
    return existingItems.length > 0
        ? mergeTemplateIntoItems(existingItems, template, opts)
        : seedDropBagItems(template, opts)
}
