import type { Waypoint } from '@/types/database'

export type BagKind = 'start' | 'finish' | 'official' | 'crew'

/** Older map-entered drop bag notes may live in general waypoint `notes`. */
export function getDropBagNotes(waypoint: Pick<Waypoint, 'drop_bag_notes' | 'notes'>): string {
    return waypoint.drop_bag_notes || waypoint.notes || ''
}

export function isStartBagWaypoint(waypoint: Pick<Waypoint, 'type' | 'mile'>): boolean {
    return waypoint.type === 'start' || waypoint.mile <= 0.01
}

export function isFinishBagWaypoint(waypoint: Pick<Waypoint, 'type'>): boolean {
    return waypoint.type === 'finish'
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
    if (isFinishBagWaypoint(waypoint)) return 'finish'
    if (isOfficialDropBagWaypoint(waypoint)) return 'official'
    if (isCrewBagCandidateWaypoint(waypoint)) return 'crew'
    return null
}

export function getBagKindLabel(kind: BagKind): string {
    if (kind === 'start') return 'Start Gear'
    if (kind === 'finish') return 'Finish Gear'
    if (kind === 'crew') return 'Crew Bag'
    return 'Official Drop Bag'
}

export interface DropBagTemplateItem {
    id: string
    text: string
    category: string
}

export interface DropBagTemplateTextField {
    id: string
    label: string
    defaultText: string
}

export interface DropBagTextFieldValue extends DropBagTemplateTextField {
    type: 'text'
    templateId: string
    templateDefaultText: string
    value: string
}

export interface DropBagItem {
    id: string
    text: string
    category: string
    checked: boolean
    quantity?: string
    templateId?: string
    templateText?: string
}

export const DROP_BAG_CATEGORIES = [
    { id: 'hydration', label: 'Hydration & Nutrition' },
    { id: 'gear', label: 'Gear & Clothing' },
    { id: 'medical', label: 'Medical & Care' },
    { id: 'conditions', label: 'Condition Specific (Smart)' },
    { id: 'custom', label: 'Custom' },
] as const

export const DEFAULT_DROP_BAG_TEMPLATE: DropBagTemplateItem[] = [
    { id: 'hydration-refill', text: 'Flasks / Bladder refilled', category: 'hydration' },
    { id: 'gels-chews', text: 'Gels / Chews', category: 'hydration' },
    { id: 'drink-mix', text: 'Drink Mix / Electrolytes', category: 'hydration' },
    { id: 'solid-food', text: 'Solid Food (Bars, Waffles)', category: 'hydration' },
    { id: 'fresh-socks', text: 'Fresh Socks', category: 'gear' },
    { id: 'extra-shoes', text: 'Extra Shoes', category: 'gear' },
    { id: 'clean-shirt', text: 'Clean Shirt', category: 'gear' },
    { id: 'chafe-cream', text: 'Chafe Cream', category: 'medical' },
    { id: 'blister-kit', text: 'Blister Kit / Tape', category: 'medical' },
    { id: 'sunscreen', text: 'Sunscreen', category: 'medical' },
    { id: 'tissues-wipes', text: 'Tissues / Wipes', category: 'medical' },
]

export const DEFAULT_START_BAG_TEMPLATE: DropBagTemplateItem[] = [
    { id: 'start-race-bib', text: 'Race bib / timing chip', category: 'gear' },
    { id: 'start-hydration', text: 'Start bottles / bladder filled', category: 'hydration' },
    { id: 'start-calories', text: 'Start calories / gels', category: 'hydration' },
    { id: 'start-devices', text: 'Phone / watch charged', category: 'gear' },
    { id: 'start-skin-care', text: 'Sunscreen / anti-chafe applied', category: 'medical' },
    { id: 'start-headlamp', text: 'Headlamp if starting in the dark', category: 'conditions' },
]

export const DEFAULT_FINISH_BAG_TEMPLATE: DropBagTemplateItem[] = [
    { id: 'finish-dry-clothes', text: 'Dry clothes', category: 'gear' },
    { id: 'finish-shoes', text: 'Recovery shoes / sandals', category: 'gear' },
    { id: 'finish-food', text: 'Recovery drink / meal', category: 'hydration' },
    { id: 'finish-warm-layer', text: 'Warm layer', category: 'gear' },
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
        .map((item, index): DropBagTemplateItem | null => {
            if (!item || typeof item !== 'object') return null
            const itemRecord = item as Record<string, unknown>
            const text = normalizeText(itemRecord)
            if (!text) return null
            const category = typeof itemRecord.category === 'string' && itemRecord.category.trim()
                ? itemRecord.category.trim()
                : 'custom'
            const savedId = typeof itemRecord.id === 'string' ? itemRecord.id.trim() : ''
            const id = savedId || `legacy-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'}`
            return { id, text, category }
        })
        .filter((item): item is DropBagTemplateItem => item !== null)
        .filter(item => item.text.length > 0)
    return items.length > 0 ? items : [...DEFAULT_DROP_BAG_TEMPLATE]
}

export function parseDropBagTemplateTextFields(raw: unknown): DropBagTemplateTextField[] {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const fields = (raw as { textFields?: unknown }).textFields
    if (!Array.isArray(fields)) return []
    return fields.flatMap((field, index) => {
        if (!field || typeof field !== 'object') return []
        const value = field as Record<string, unknown>
        const label = typeof value.label === 'string' ? value.label.trim() : ''
        if (!label) return []
        return [{
            id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `legacy-text-${index}`,
            label,
            defaultText: typeof value.defaultText === 'string' ? value.defaultText : '',
        }]
    })
}

export function getDropBagTextFields(raw: unknown, template: DropBagTemplateTextField[]): DropBagTextFieldValue[] {
    const saved = Array.isArray(raw) ? raw.filter(item => item && typeof item === 'object' && item.type === 'text') as Record<string, unknown>[] : []
    return template.map(field => {
        const prior = saved.find(item => item.templateId === field.id)
        const priorValue = typeof prior?.value === 'string' ? prior.value : null
        const priorDefault = typeof prior?.templateDefaultText === 'string' ? prior.templateDefaultText : null
        return {
            ...field,
            type: 'text',
            templateId: field.id,
            templateDefaultText: field.defaultText,
            value: priorValue !== null && (priorDefault === null || priorValue !== priorDefault) ? priorValue : field.defaultText,
        }
    })
}

export function parseDropBagItems(raw: unknown): DropBagItem[] {
    if (!Array.isArray(raw)) return []

    return raw
        .map((item, i): DropBagItem | null => {
            if (!item || typeof item !== 'object') return null
            const itemRecord = item as Record<string, unknown>
            if (itemRecord.type === 'text') return null
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
                templateId: typeof itemRecord.templateId === 'string' && itemRecord.templateId.trim()
                    ? itemRecord.templateId.trim()
                    : undefined,
                templateText: typeof itemRecord.templateText === 'string'
                    ? itemRecord.templateText
                    : undefined,
            }
        })
        .filter((item): item is DropBagItem => item !== null)
}

export function seedDropBagItems(
    template: DropBagTemplateItem[],
    opts: { isNight: boolean; isHot: boolean; isCold: boolean }
): DropBagItem[] {
    const items: DropBagItem[] = template.map((item) => ({
        id: `tpl_${item.id}`,
        text: item.text,
        category: item.category,
        checked: false,
        templateId: item.id,
        templateText: item.text,
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
    const endpointTemplate = kind === 'start'
        ? DEFAULT_START_BAG_TEMPLATE
        : kind === 'finish'
            ? DEFAULT_FINISH_BAG_TEMPLATE
            : null
    if (!endpointTemplate) return dropBagTemplate

    const result: DropBagTemplateItem[] = []
    const usedKeys = new Set<string>()

    for (const item of [...dropBagTemplate, ...endpointTemplate]) {
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
// items are regenerated from current conditions; packed smart gear and custom items are kept.
// Checked state and quantities are preserved for any item that still exists.
export function mergeTemplateIntoItems(
    existing: DropBagItem[],
    template: DropBagTemplateItem[],
    opts: { isNight: boolean; isHot: boolean; isCold: boolean }
): DropBagItem[] {
    const existingByKey = new Map(existing.map(item => [itemKey(item), item]))
    const existingByTemplateId = new Map(existing.flatMap(item => item.templateId ? [[item.templateId, item] as const] : []))
    const existingById = new Map(existing.map(item => [item.id, item]))
    const result: DropBagItem[] = []
    const usedKeys = new Set<string>()
    const usedIds = new Set<string>()
    template.forEach((tpl, i) => {
        const key = itemKey(tpl)
        if (usedKeys.has(key)) return
        const templateItemId = `tpl_${tpl.id}`
        const priorByKey = existingByKey.get(key)
        const priorByStableId = existingByTemplateId.get(tpl.id)
        const legacyPrior = existingById.get(`tpl_${i}`)
        const prior = priorByStableId ?? priorByKey ?? legacyPrior
        const hasPerBagRename = !!prior?.templateText && prior.text !== prior.templateText
        result.push({
            id: templateItemId,
            text: hasPerBagRename ? prior.text : tpl.text,
            category: tpl.category,
            checked: prior?.checked ?? false,
            quantity: prior?.quantity,
            templateId: tpl.id,
            templateText: tpl.text,
        })
        usedKeys.add(key)
        usedIds.add(templateItemId)
        if (prior) {
            usedKeys.add(itemKey(prior))
            usedIds.add(prior.id)
        }
    })

    for (const conditionItem of seedDropBagItems([], opts)) {
        const key = itemKey(conditionItem)
        if (usedKeys.has(key)) continue
        const prior = existingByKey.get(key) ?? existingById.get(conditionItem.id)
        const id = prior && !usedIds.has(prior.id) ? prior.id : conditionItem.id
        result.push({
            ...conditionItem,
            id,
            text: prior && itemKey(prior) !== key ? prior.text : conditionItem.text,
            checked: prior?.checked ?? conditionItem.checked,
            quantity: prior?.quantity,
        })
        usedKeys.add(key)
        usedIds.add(id)
        if (prior) {
            usedKeys.add(itemKey(prior))
            usedIds.add(prior.id)
        }
    }

    for (const item of existing) {
        const key = itemKey(item)
        if (usedKeys.has(key) || usedIds.has(item.id)) continue
        const isLegacyTemplateItem = /^tpl_\d+$/.test(item.id)
        const isPerBagItem = !item.templateId && !isLegacyTemplateItem
        if (isPerBagItem || (item.category === 'conditions' && item.checked)) {
            result.push(item)
            usedKeys.add(key)
            usedIds.add(item.id)
        }
    }

    return result
}

export function createDropBagItem(text: string, category: string, id = `custom_${Date.now()}`): DropBagItem {
    return {
        id,
        text: text.trim(),
        category,
        checked: true,
    }
}

export function clearDropBagChecklistItems(waypoints: Waypoint[], bagWaypointIds: readonly string[]): Waypoint[] {
    const bagIds = new Set(bagWaypointIds)
    return waypoints.map(waypoint => bagIds.has(waypoint.id)
        ? { ...waypoint, drop_bag_items: null }
        : waypoint)
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
