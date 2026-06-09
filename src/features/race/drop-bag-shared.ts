import type { Waypoint } from '@/types/database'

/** Older map-entered drop bag notes may live in general waypoint `notes`. */
export function getDropBagNotes(waypoint: Pick<Waypoint, 'drop_bag_notes' | 'notes'>): string {
    return waypoint.drop_bag_notes || waypoint.notes || ''
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

export function parseDropBagTemplate(raw: unknown): DropBagTemplateItem[] {
    if (!Array.isArray(raw)) return [...DEFAULT_DROP_BAG_TEMPLATE]
    const items = raw
        .filter((item): item is DropBagTemplateItem =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as DropBagTemplateItem).text === 'string' &&
            typeof (item as DropBagTemplateItem).category === 'string'
        )
        .map(item => ({ text: item.text.trim(), category: item.category }))
        .filter(item => item.text.length > 0)
    return items.length > 0 ? items : [...DEFAULT_DROP_BAG_TEMPLATE]
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
    const result: DropBagItem[] = []
    const usedKeys = new Set<string>()

    template.forEach((tpl, i) => {
        const key = itemKey(tpl)
        if (usedKeys.has(key)) return
        const prior = existingByKey.get(key)
        result.push({
            id: prior?.id ?? `tpl_${i}`,
            text: tpl.text,
            category: tpl.category,
            checked: prior?.checked ?? false,
            quantity: prior?.quantity,
        })
        usedKeys.add(key)
    })

    for (const conditionItem of seedDropBagItems([], opts)) {
        const key = itemKey(conditionItem)
        if (usedKeys.has(key)) continue
        const prior = existingByKey.get(key)
        result.push({
            ...conditionItem,
            checked: prior?.checked ?? conditionItem.checked,
            quantity: prior?.quantity,
        })
        usedKeys.add(key)
    }

    for (const item of existing) {
        const key = itemKey(item)
        if (usedKeys.has(key)) continue
        if (item.category === 'custom') {
            result.push(item)
            usedKeys.add(key)
        }
    }

    return result
}
