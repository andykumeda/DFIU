import { describe, expect, it } from 'vitest'
import type { Waypoint } from '@/types/database'
import { clearDropBagChecklistItems, createDropBagItem, getCrewNotesTemplate, getDropBagEditorItems, getDropBagTemplateForKind, getDropBagTextFields, mergeTemplateIntoItems, parseDropBagCrewItems } from './drop-bag-shared'

describe('crew template', () => {
    const template = {
        items: [{ id: 'runner-flask', text: 'Flask', category: 'hydration' }],
        crewItems: [{ id: 'crew-cooler', text: 'Cooler', category: 'crew' }],
        crewNotesDefault: 'Bring ice',
    }

    it('adds crew gear to each bag without replacing the runner checklist', () => {
        const bagTemplate = getDropBagTemplateForKind('official', template.items, parseDropBagCrewItems(template))
        expect(bagTemplate.map(item => item.text)).toEqual(['Flask', 'Cooler'])
        const items = getDropBagEditorItems([{ id: 'tpl_runner-flask', text: 'Flask', category: 'hydration', checked: true }], bagTemplate, { isNight: false, isHot: false, isCold: false })
        expect(items.find(item => item.text === 'Flask')?.checked).toBe(true)
        expect(items.find(item => item.text === 'Cooler')?.checked).toBe(false)
    })

    it('uses the new crew notes default while keeping each bag override', () => {
        const field = getCrewNotesTemplate(template)
        expect(getDropBagTextFields([], [field])[0].value).toBe('Bring ice')
        const saved = [{ type: 'text', templateId: field.id, value: 'Meet at Redbox', templateDefaultText: 'Bring ice' }]
        expect(getDropBagTextFields(saved, [{ ...field, defaultText: 'Bring cups' }])[0].value).toBe('Meet at Redbox')
    })

    it('preserves packed crew gear and quantity when the crew template changes', () => {
        const saved = [{ id: 'tpl_crew-cooler', templateId: 'crew-cooler', templateText: 'Cooler', text: 'Cooler', category: 'crew', checked: true, quantity: '2' }]
        const revised = [{ id: 'crew-cooler', text: 'Large cooler', category: 'crew' }]
        expect(mergeTemplateIntoItems(saved, revised, { isNight: false, isHot: false, isCold: false })[0]).toMatchObject({ text: 'Large cooler', checked: true, quantity: '2' })
    })
})

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
