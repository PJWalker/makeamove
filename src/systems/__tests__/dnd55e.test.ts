import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { checkSystem, getSystem, listSystems } from '..'
import { dnd55e as dnd, pactMagic, proficiencyAt, spellSlots } from '../dnd55e'
import { CLASSES, ITEMS } from '../dnd55e/data'
import { characterView, createCharacter, derive, instanceOf, actionsFor } from '../../characters/store'
import { performMove, planMove } from '../../characters/moves'

function character(classId: string, scores: Record<string, number>, level = 1) {
  const doc = new Y.Doc()
  const characters = doc.getMap<Y.Map<any>>('characters')
  const id = createCharacter(characters, dnd, { name: 'Vex', classId, owner: 'me', scores })
  const m = characters.get(id)!
  m.set('level', level)
  return { m, view: () => characterView(id, m, dnd) }
}

function equip(m: Y.Map<any>, itemId: string) {
  const inv = m.get('inventory') as Y.Map<any>
  const item = { ...instanceOf(ITEMS.find((i) => i.id === itemId)!, `a${inv.size}`), equipped: true }
  inv.set(item.id, item)
}

describe('D&D 5.5e', () => {
  it('is registered and holds together', () => {
    expect(checkSystem(dnd)).toEqual([])
    expect(getSystem('dnd-5.5e')).toBe(dnd)
    expect(listSystems().map((s) => s.id)).toEqual(['dungeon-world', 'dnd-5.5e'])
  })

  it('works out modifiers, proficiency, slots and pact magic', () => {
    expect([1, 8, 9, 10, 11, 12, 15, 20].map(dnd.modifier)).toEqual([-5, -1, -1, 0, 0, 1, 2, 5])
    expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyAt)).toEqual([2, 2, 3, 4, 5, 6, 6])
    const wizard = CLASSES.find((k) => k.id === 'wizard')!
    const paladin = CLASSES.find((k) => k.id === 'paladin')!
    expect(spellSlots(wizard, 5)).toEqual([4, 3, 2])
    expect(spellSlots(paladin, 1)).toEqual([2])
    expect(spellSlots(paladin, 5)).toEqual([4, 2])
    expect(pactMagic(1)).toEqual({ slots: 1, level: 1 })
    expect(pactMagic(11)).toEqual({ slots: 3, level: 5 })
  })

  it('derives HP, AC and saves from class, armour and scores', () => {
    const { m, view } = character('fighter', { str: 16, dex: 14, con: 14 }, 3)
    let d = derive(view(), dnd)
    // d10 + 2, then 6 + 2 per level.
    expect(d.values.maxHp).toBe(12 + 2 * 8)
    expect(d.values.ac).toBe(12)
    expect(d.values['save:str']).toBe(2)
    expect(d.values['save:dex']).toBe(0)
    equip(m, 'chain-shirt')
    equip(m, 'shield')
    d = derive(view(), dnd)
    expect(d.values.ac).toBe(13 + 2 + 2)
    equip(m, 'gauntlets-of-ogre-power')
    expect(derive(view(), dnd).mods.str).toBe(4)
  })

  it('gives Barbarians and Monks Unarmored Defense', () => {
    expect(derive(character('barbarian', { dex: 14, con: 16 }).view(), dnd).values.ac).toBe(15)
    expect(derive(character('monk', { dex: 16, wis: 14 }).view(), dnd).values.ac).toBe(15)
  })

  it('rolls skills with proficiency and Expertise, and attacks with the weapon in hand', () => {
    const { m, view } = character('rogue', { dex: 16 })
    ;(m.get('data') as Y.Map<any>).set('skill:stealth', 2)
    const c = view()
    const d = derive(c, dnd)
    const stealth = dnd.actions.find((a) => a.id === 'skill-stealth')!
    expect(planMove(dnd, stealth, c, d).formula).toBe('1d20+3[DEX]+4[Prof]')
    expect(planMove(dnd, stealth, c, d, { mode: 'advantage' }).formula).toBe('2d20kh1+3[DEX]+4[Prof]')
    equip(m, 'rapier')
    const attack = dnd.actions.find((a) => a.id === 'finesse-attack')!
    const hit = performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 12)
    expect(hit.result).toBe('rolled')
    expect(hit.suggestions[0].roll?.formula).toBe('1d8+3[DEX]')
    const crit = performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 20)
    expect(crit.result).toBe('crit')
    expect(crit.suggestions[0].roll?.formula).toBe('2d8+3[DEX]')
    expect(performMove(dnd, attack, view(), derive(view(), dnd), {}, () => 1).result).toBe('fumble')
  })

  it('gives casters the spells their slots reach, and scales cantrips', () => {
    const { view } = character('wizard', { int: 16 }, 5)
    const c = view()
    const d = derive(c, dnd)
    const ids = actionsFor(c, dnd, d).map((a) => a.id)
    expect(ids).toContain('fireball')
    expect(ids).not.toContain('cure-wounds')
    expect(d.values.spellDc).toBe(8 + 3 + 3)
    const bolt = dnd.actions.find((a) => a.id === 'fire-bolt')!
    expect(performMove(dnd, bolt, c, d, {}, () => 10).suggestions[0].roll?.formula).toBe('2d10')
    const fighter = character('fighter', {}).view()
    expect(actionsFor(fighter, dnd, derive(fighter, dnd)).some((a) => a.category === 'spell')).toBe(false)
  })

  it('takes 2 per level of Exhaustion from every d20 test', () => {
    const { m, view } = character('fighter', { str: 10 })
    ;(m.get('data') as Y.Map<any>).set('exhaustion', 2)
    const c = view()
    const d = derive(c, dnd)
    expect(planMove(dnd, dnd.actions.find((a) => a.id === 'check-str')!, c, d).formula).toBe('1d20-4[Exhaustion]')
    expect(d.values.speed).toBe(20)
  })

  describe('actions against targets', () => {
    const attack = dnd.actions.find((a) => a.id === 'melee-attack')!
    const targets = [
      { id: 't1', name: 'Goblin', characterId: 'g1' },
      { id: 't2', name: 'Orc', characterId: 'g2', long: true },
    ]
    const ac: Record<string, number> = { g1: 13, g2: 30 }
    const valueAt = (t: { characterId?: string }, key: string) => (key === 'ac' ? ac[t.characterId!] : undefined)

    it('rolls once per target and reads each against its AC', () => {
      const { view } = character('fighter', { str: 16 })
      const c = view()
      // Goblin: 12 + 3 + 2 = 17 hits AC 13. Orc at long range: disadvantage, 15 and 12 keep 12, 17 misses AC 30.
      const r = performMove(dnd, attack, c, derive(c, dnd), {}, (() => {
        const vals = [12, 15, 12]
        let i = 0
        return () => vals[i++]
      })(), { targets, valueAt })
      expect(r.roll).toBeUndefined()
      expect(r.targets!.map((t) => [t.roll!.total, t.against, t.hit])).toEqual([
        [17, 13, true],
        [17, 30, false],
      ])
      expect(r.targets![1].roll!.formula.startsWith('2d20kl1')).toBe(true)
      // Damage is offered for the target that was hit.
      expect(r.suggestions[0].roll!.targets!.map((t) => t.id)).toEqual(['t1'])
      expect(r.suggestions[0].roll!.damage).toBe('damage')
    })

    it('hits on a natural 20 and misses on a natural 1, whatever the AC', () => {
      const { view } = character('fighter', { str: 16 })
      const c = view()
      const r = performMove(dnd, attack, c, derive(c, dnd), { mode: 'advantage' }, (() => {
        const vals = [20, 1, 1, 1]
        let i = 0
        return () => vals[i++]
      })(), { targets, valueAt })
      // Advantage cancels the Orc's long-range disadvantage.
      expect(r.targets![1].roll!.formula.startsWith('1d20')).toBe(true)
      expect(r.targets!.map((t) => [t.result, t.hit])).toEqual([
        ['crit', true],
        ['fumble', false],
      ])
      expect(r.suggestions[0].label).toMatch(/critical/)
    })

    it('asks each target of a save spell to roll against the caster’s DC', () => {
      const { view } = character('wizard', { int: 16 }, 5)
      const c = view()
      const fireball = dnd.actions.find((a) => a.id === 'fireball')!
      const r = performMove(dnd, fireball, c, derive(c, dnd), {}, undefined, { targets })
      expect(r.save).toMatchObject({ action: 'save-dex', name: 'Dexterity Save', dc: 14 })
      expect(r.suggestions[0].roll).toMatchObject({ damage: 'fire', targets: [{ id: 't1' }, { id: 't2' }] })
    })
  })
})
