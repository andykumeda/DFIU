import { describe, expect, it } from 'vitest'
import type { Waypoint } from '@/types/database'
import { clearDropBagChecklistItems, createDropBagItem, mergeTemplateIntoItems } from './drop-bag-shared'

describe('mergeTemplateIntoItems', () => {
    it('applies renamed template items to an existing bag while preserving packed state and quantity', () => {
        const merged = mergeTemplateIntoItems(
            [
                { id: 'tpl_0', text: 'Flasks / Bladder refilled', category: 'hydration', checked: false },
                { id: 'tpl_1', text: 'Gels / Chews', category: 'hydration', checked: true, quantity: '3' },
            ],
            [
                { id: 'hydration-refill', text: 'Flasks / Bladder refilled', category: 'hydration' },
                { id: 'nutrition-chews', text: 'Chews', category: 'hydration' },
            ],
            { isNight: false, isHot: false, isCold: false },
        )

        expect(merged[1]).toEqual(
            { id: 'tpl_nutrition-chews', templateId: 'nutrition-chews', templateText: 'Chews', text: 'Chews', category: 'hydration', checked: true, quantity: '3' },
        )
    })

    it('keeps true per-bag custom items when the template changes', () => {
        const custom = { id: 'custom_1', text: 'Soda', category: 'hydration', checked: true, quantity: '2' }
        const merged = mergeTemplateIntoItems(
            [custom],
            [{ id: 'nutrition-chews', text: 'Chews', category: 'hydration' }],
            { isNight: false, isHot: false, isCold: false },
        )

        expect(merged).toContainEqual(custom)
    })
})

describe('createDropBagItem', () => {
    it('places a custom item in the selected category', () => {
        expect(createDropBagItem('  Magic Noodle Soup  ', 'hydration', 'custom_1')).toEqual({
            id: 'custom_1',
            text: 'Magic Noodle Soup',
            category: 'hydration',
            checked: true,
        })
    })
})

describe('clearDropBagChecklistItems', () => {
    it('clears only checklist items for the selected bags and preserves bag names and notes', () => {
        const bag = {
            id: 'bag-1',
            drop_bag_items: [{ id: 'old', text: 'Old item' }],
            drop_bag_name: 'Black Duffel',
            drop_bag_notes: 'Keep this label',
        } as unknown as Waypoint
        const nonBag = {
            id: 'aid-1',
            drop_bag_items: [{ id: 'unrelated', text: 'Leave alone' }],
        } as unknown as Waypoint

        const [clearedBag, untouchedWaypoint] = clearDropBagChecklistItems([bag, nonBag], ['bag-1'])

        expect(clearedBag.drop_bag_items).toBeNull()
        expect(clearedBag.drop_bag_name).toBe('Black Duffel')
        expect(clearedBag.drop_bag_notes).toBe('Keep this label')
        expect(untouchedWaypoint).toBe(nonBag)
    })
})
