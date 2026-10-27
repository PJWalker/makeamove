import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { boostFrom, choicesAt, dataFrom, pointsSpent, raise } from '../creation'
import { characterView, createCharacter, derive, actionsFor } from '../store'
import { dnd55e as dnd } from '../../systems/dnd55e'

describe('guided creation', () => {
  const creation = dnd.creation!

  it('offers species and background at creation, and the class’s subclass at level 3', () => {
    expect(choicesAt(creation, 'create', 'wizard').map((c) => c.id)).toEqual(['species', 'background'])
    const at3 = choicesAt(creation, 3, 'wizard')
    expect(at3.map((c) => c.id)).toEqual(['subclass'])
    expect(at3[0].options.map((o) => o.id)).toEqual(['evoker'])
    expect(choicesAt(creation, 2, 'wizard')).toEqual([])
  })

  it('costs a point buy, refusing scores it can’t buy', () => {
    const buy = creation.scores.pointBuy!
    expect(pointsSpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }, buy)).toBe(27)
    expect(pointsSpent({ str: 16, dex: 8 }, buy)).toBeNull()
  })

  it('places a background’s boost and caps scores at 20', () => {
    const sage = creation.choices[1].options.find((o) => o.id === 'sage')!
    expect(boostFrom(sage, 0, ['int', 'con', 'wis'])).toEqual({ int: 2, con: 1 })
    expect(boostFrom(sage, 1, ['int', 'con', 'wis'])).toEqual({ int: 1, con: 1, wis: 1 })
    expect(raise({ int: 19, con: 10 }, { int: 2, con: 1 })).toEqual({ int: 20, con: 11 })
  })

  it('writes each choice and its grants, gathering list fields', () => {
    const choices = choicesAt(creation, 'create', 'fighter')
    const data = dataFrom(choices, { species: 'goliath', background: 'soldier' }, ['feats'])
    expect(data).toMatchObject({ species: 'goliath', speed: 35, background: 'soldier', feats: 'savage-attacker', 'skill:athletics': 1 })
  })
})

describe('5.5e origins in the numbers', () => {
  function make(data: Record<string, string | number>, level = 1, classId = 'fighter') {
    const doc = new Y.Doc()
    const characters = doc.getMap<Y.Map<any>>('characters')
    const id = createCharacter(characters, dnd, { name: 'Brom', classId, owner: 'me', scores: { con: 14, dex: 14 }, data })
    characters.get(id)!.set('level', level)
    return characterView(id, characters.get(id)!, dnd)
  }

  it('adds Dwarven Toughness and Tough per level, and Alert to initiative', () => {
    const plain = derive(make({}, 4), dnd).values
    const tough = derive(make({ species: 'dwarf', feats: 'tough,alert' }, 4), dnd).values
    expect(tough.maxHp - plain.maxHp).toBe(3 * 4)
    expect(tough.initiative - plain.initiative).toBe(plain.prof)
  })

  it('gives the subclass from level 3 and species actions to their species', () => {
    const ids = (c: ReturnType<typeof make>) => actionsFor(c, dnd, derive(c, dnd)).map((a) => a.id)
    expect(ids(make({ subclass: 'champion' }, 2))).not.toContain('subclass-champion')
    expect(ids(make({ subclass: 'champion' }, 3))).toContain('subclass-champion')
    expect(ids(make({ species: 'dragonborn' }))).toContain('breath-weapon')
    expect(ids(make({ species: 'human' }))).not.toContain('breath-weapon')
  })
})
