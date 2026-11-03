import { describe, expect, it } from 'vitest'
import { dungeonWorld as dw } from '../dungeon-world'
import { checkSystem, defineSystem, listSystems } from '..'
import { resolveEffects } from '../effects'
import { bladesInTheDark as blades } from '../blades-in-the-dark'
import { dungeonWorld2 as dw2 } from '../dungeon-world-2'
import { daggerheart as dh } from '../daggerheart'
import { testCharacter, testSystem } from './fixtures/testSystem'
import { PATHS as DW2_PATHS } from '../dungeon-world-2/paths'
import { derive } from '../../features/characters/store'
import type { CharacterView } from '../../features/characters/types'
import { asksFirst, performMove, planMove } from '../../features/characters/moves'
import { boostFrom, choicesAt } from '../../features/characters/creation'


const bladesCharacter = (over: Partial<CharacterView> = {}): CharacterView => ({
  id: 'test', kind: 'pc', name: 'Test', owner: 'me', scores: {}, data: {}, resources: {},
  conditions: [], durations: {}, modifiers: {}, fields: {}, inventory: [], learned: [], ...over,
})
const dice = (...values: number[]) => {
  let index = 0
  if (!values.length) throw new RangeError("Dice fixture needs at least one result")
  return () => (values)[index++ % values.length]!
}

describe('Test system', () => {
  it('validates the fixture without registering it for the app', () => {
    expect(checkSystem(testSystem)).toEqual([])
    expect(listSystems()).not.toContain(testSystem)
    expect((testSystem.items)[0]!.equippable).toBe(true)
    expect((testSystem.conditions)[0]!.lockable).toBe(true)
    expect(testSystem.creation?.choices[0]?.options).toHaveLength(2)
    expect(testSystem.sheet?.pc.some((section) => section.kind === 'loadout')).toBe(true)
    expect(testSystem.sheet?.npc.some((section) => section.kind === 'npcFields')).toBe(true)
    expect(testSystem.monsters).toHaveLength(1)
  })

  it('exercises optional system and nested entity callbacks deterministically', () => {
    const character = testCharacter({ data: { checks: 0, originId: 'curious' } })
    const derived = derive(character, testSystem)
    const check = testSystem.actions.find((action) => action.id === 'test-check')!
    const step = (check.steps)[0]!
    const learnable = testSystem.actions.find((action) => action.id === 'test-learnable')!
    const followUp = testSystem.followUps.find((entry) => entry.id === 'test-damage-roll')!
    const loadout = (testSystem.loadouts ?? [])[0]!

    expect(testSystem.modifier(2.9)).toBe(2)
    expect(testSystem.result(12, [])).toBe('success')
    expect(testSystem.checkRoll!('d20+1', 'might', character, check)).toBe('d20+1+0[Test]')
    expect(testSystem.hits!(1, [20], 12)).toBe(true)
    expect(testSystem.hits!(11, [], 12)).toBe(false)
    expect(testSystem.resolveDamage!(character, derived, 3, { armor: true })).toEqual({ hp: 3, resources: [{ id: 'focus', by: -1 }] })
    expect(testSystem.concentrationSave!(8)).toEqual({ action: 'test-save', difficulty: { kind: 'fixed', value: 10 } })
    expect(testSystem.learnedActionAllowed!(learnable, character, derived)).toBe(true)
    expect(check.variants!(character, derived)).toEqual([{ id: 'steady', label: 'Steady', costs: [], values: { bonus: 1 } }])
    expect(step.kind === 'check' && step.followUpsFor!({ formula: 'd20', terms: [], total: 11 }, character, derived)).toEqual(['mark-check'])
    expect(loadout.available!(character, derived)).toEqual(['curious-option'])
    expect(followUp.kind === 'roll' && followUp.formula(character, derived)).toBe('d6')
    expect(testSystem.actionsFor(character, derived)).toContain(check)
    expect(testSystem.tokenStats(character, derived)).toEqual([{ id: 'hp', label: 'HP', value: 12, max: 12, colour: '#4a9b70' }])
    expect(testSystem.actions.find((action) => action.id === 'test-save')?.steps[0]).toMatchObject({ kind: 'save', action: 'test-check' })
  })
})

describe('Blades in the Dark', () => {
  it('offers unbounded Veteran advancement choices and applies Mule load limits', () => {
    const choices = choicesAt(blades.creation, 40, { playbook: 'cutter' }).flatMap((choice) => choice.options)
    expect(choices.some((option) => option.id === 'ability-whisper-iron-will')).toBe(true)
    expect(derive(bladesCharacter({ data: { specialAbilities: 'ability-cutter-mule', load: 3 } }), blades).values.maxLoad).toBe(5)
    expect(blades.actions.find((action) => action.id === 'ability-cutter-mule')?.text).toContain('Light: 5')
  })

  it('offers desperate XP, resistance Stress, and vice clearing from the actual dice result', () => {
    const character = bladesCharacter({ scores: { hunt: 1 }, data: { stress: 6 } })
    const derived = derive(character, blades)
    const hunt = blades.actions.find((action) => action.id === 'hunt')!
    expect(performMove(blades, hunt, character, derived, { mode: 'desperate' }, () => 6).suggestions.some((suggestion) => suggestion.id === 'xp-insight')).toBe(true)
    const resist = blades.actions.find((action) => action.id === 'resist-insight')!
    expect(performMove(blades, resist, character, derived, {}, () => 4).suggestions).toContainEqual(expect.objectContaining({ bump: { field: 'stress', by: 2 } }))
    const vice = blades.actions.find((action) => action.id === 'indulge-vice')!
    expect(performMove(blades, vice, character, derived, {}, () => 3).suggestions).toContainEqual(expect.objectContaining({ bump: { field: 'stress', by: -3 } }))
  })

  const skirmish = blades.actions.find((action) => action.id === 'skirmish')!

  it('has valid data and twelve zero-based action ratings', () => {
    expect(checkSystem(blades)).toEqual([])
    expect(blades.stats).toHaveLength(12)
    expect(blades.stats.every((stat) => stat.default === 0 && stat.min === 0 && stat.max === 4)).toBe(true)
    expect(blades.creation?.scores.pointBuy?.budget).toBe(4)
  })

  it('rolls two lowest dice at zero pool and suppresses zero-pool criticals', () => {
    const c = bladesCharacter()
    const d = derive(c, blades)
    expect(performMove(blades, skirmish, c, d, {}, dice(6, 2)).result).toBe('miss')
    expect(performMove(blades, skirmish, c, d, {}, dice(6, 6)).result).toBe('strong')
    expect(planMove(blades, skirmish, c, d, { extra: -1 }).formula).toBe('2d6kl1[Risky]')
  })

  it('uses the highest die, detects criticals, and spends bonus dice', () => {
    const c = bladesCharacter({ scores: { skirmish: 2 }, modifiers: { 'bonus-dice': 1 } })
    const result = performMove(blades, skirmish, c, derive(c, blades), {}, dice(6, 6, 2))
    expect(result.roll?.formula).toBe('3d6kh1[Risky]')
    expect(result.result).toBe('critical')
    expect(result.spent).toEqual(['bonus-dice'])
  })

  it('creates a Cutter with its starting dots and a playbook ability', () => {
    const playbook = blades.creation!.choices.find((choice) => choice.id === 'playbook')!.options.find((option) => option.id === 'cutter')!
    expect(boostFrom(playbook, 0, playbook.boost!.stats)).toEqual({ skirmish: 2, command: 1 })
    expect(blades.creation!.scores.pointBuy?.budget).toBe(4)
    expect(blades.creation!.choices.find((choice) => choice.id === 'specialAbility')?.options.find((option) => option.name === 'Battleborn')?.requires).toEqual({ playbook: 'cutter' })
  })

  it('preserves selected action-roll position', () => {
    const c = bladesCharacter({ scores: { skirmish: 1 } })
    expect(performMove(blades, skirmish, c, derive(c, blades), { mode: 'controlled' }, dice(4)).outcome).toContain('minor complication')
    expect(performMove(blades, skirmish, c, derive(c, blades), { mode: 'desperate' }, dice(4)).outcome).toContain('severe harm')
  })

  it('derives resistance dice from actions with at least one dot', () => {
    const c = bladesCharacter({ scores: { hunt: 1, skirmish: 2, prowl: 1, attune: 1, sway: 1 } })
    const d = derive(c, blades)
    expect(d.values).toMatchObject({ insight: 1, prowess: 2, resolve: 2, vice: 1 })
    const resist = blades.actions.find((action) => action.id === 'resist-prowess')!
    const result = performMove(blades, resist, c, d, {}, dice(2, 5))
    expect(result.roll?.formula).toBe('2d6kh1[Resistance]')
    expect(result.outcome).toContain('Resistance works')
  })

  it('advances a selected core clock by the project result', () => {
    const action = blades.actions.find((entry) => entry.id === 'long-term-project')!
    const c = bladesCharacter({ scores: { study: 2 } })
    const result = performMove(blades, action, c, derive(c, blades), { stat: 'study', counterMessageId: 'clock-1' }, dice(5))
    expect(result.result).toBe('weak')
    expect(result.suggestions).toContainEqual(expect.objectContaining({ count: { messageId: 'clock-1', by: 2 } }))
  })

  it('only offers position choices for action rolls', () => {
    const action = blades.actions.find((entry) => entry.id === 'skirmish')!
    const resistance = blades.actions.find((entry) => entry.id === 'resist-prowess')!
    expect(asksFirst(blades, action)).toBe(true)
    expect(asksFirst(blades, resistance)).toBe(false)
  })
})

describe('Dungeon World 2', () => {
  it('has valid data, five direct stats, and nine class options', () => {
    expect(checkSystem(dw2)).toEqual([])
    expect(dw2.stats.map((stat) => [stat.id, stat.min, stat.max])).toEqual([
      ['str', -1, 3], ['dex', -1, 3], ['int', -1, 3], ['wis', -1, 3], ['cha', -1, 3],
    ])
    expect((dw2.creation?.choices ?? [])[0]!.options).toHaveLength(9)
    expect(dw2.creation?.scores.standardArray).toEqual([2, 1, 0, 0, -1])
  })

  it('registers both systems for campaign selection', () => {
    expect(listSystems().map((system) => system.id)).toEqual(expect.arrayContaining(['blades-in-the-dark', 'dungeon-world-2']))
  })

  it('applies conditions as disadvantage and cancels them with advantage', () => {
    const move = dw2.actions.find((action) => action.id === 'sneak-past')!
    const c = bladesCharacter({ scores: { dex: 1 }, conditions: ['frightened'] })
    const d = derive(c, dw2)
    expect(planMove(dw2, move, c, d).formula).toBe('3d6kl2+1[DEX]')
    expect(planMove(dw2, move, c, d, { mode: 'advantage' }).formula).toBe('2d6+1[DEX]')
    expect(planMove(dw2, move, bladesCharacter({ scores: { dex: -1 } }), derive(bladesCharacter({ scores: { dex: -1 } }), dw2), { mode: 'advantage' }).formula).toBe('3d6kh2-1[DEX]')
  })

  it('uses the Rogue mixed dice, including advantage and disadvantage', () => {
    const move = dw2.actions.find((action) => action.id === 'rogue-tricks-trade')!
    const c = bladesCharacter({ scores: { dex: 1 } })
    const d = derive(c, dw2)
    expect(planMove(dw2, move, c, d).formula).toBe('d8+d6+1[DEX]')
    expect(planMove(dw2, move, c, d, { mode: 'advantage' }).formula).toBe('d8+2d6kh1+1[DEX]')
    expect(planMove(dw2, move, c, d, { mode: 'disadvantage' }).formula).toBe('d8+2d6kl1+1[DEX]')
  })

  it('derives class HP and grants only the selected class starting move', () => {
    const c = bladesCharacter({ data: { classId: 'wizard', level: 4 } })
    const d = derive(c, dw2)
    expect(d.values.maxHp).toBe(9)
    const actions = dw2.actionsFor(c, d).map((action) => action.id)
    expect(actions).toContain('wizard-weave-arcane')
    expect(actions).not.toContain('barbarian-rage')
  })

  it('offers all Paths and grants only the acquired starting move until a Path Move is selected', () => {
    expect(DW2_PATHS).toHaveLength(27)
    expect(DW2_PATHS.every((path) => path.moves.length === 5)).toBe(true)
    expect(DW2_PATHS.every((path) => path.rules.length === 5 && path.rules.every((move) => move.text.length > 40))).toBe(true)
    expect(dw2.actions.find((action) => action.name === 'Forthright Speech')?.steps[0]).toMatchObject({ kind: 'check', stat: 'cha', outcomes: { strong: expect.stringContaining('clear a Condition') } })
    const path = DW2_PATHS.find((entry) => entry.id === 'barbarian-berserker')!
    const choice = dw2.creation!.choices.find((entry) => entry.id === 'advancement-2')!
    expect(choice.options.some((option) => option.id === path.id)).toBe(true)
    const c = bladesCharacter({ data: { classId: 'barbarian', ownedPaths: path.id } })
    const ids = dw2.actionsFor(c, derive(c, dw2)).map((action) => action.id)
    expect(ids).toContain(`path-${path.id}-1`)
    expect(ids).not.toContain(`path-${path.id}-2`)
    const moves = choicesAt(dw2.creation, 3, c.data).find((entry) => entry.id === 'advancement-3')!
    expect(moves.options.some((option) => option.id === `path-move-${path.id}-2`)).toBe(true)
  })

  it('caps stat advancements at +2 before level 10 and allows +3 at level 10', () => {
    const levelNine = choicesAt(dw2.creation, 9, {}, { str: 2 }).find((choice) => choice.id === 'advancement-9')!
    expect(levelNine.options.some((option) => option.id === 'stat-str-9')).toBe(false)
    const levelTen = choicesAt(dw2.creation, 10, {}, { str: 2 }).find((choice) => choice.id === 'advancement-10')!
    expect(levelTen.options.some((option) => option.id === 'stat-str-10')).toBe(true)
    expect(derive(bladesCharacter({ scores: { str: 3 } }), dw2).mods.str).toBe(3)
  })

  it('limits tiered stat, Path, multiclass, and magic-item acquisitions', () => {
    const data = { classId: 'barbarian', advancements: 'stat-str-2,stat-dex-3', ownedPaths: 'barbarian-berserker' }
    const early = choicesAt(dw2.creation, 4, data).flatMap((choice) => choice.options)
    expect(early.some((option) => option.id.startsWith('stat-'))).toBe(false)
    expect(early.some((option) => option.id === 'barbarian-hedonist')).toBe(false)
    const middle = choicesAt(dw2.creation, 5, data).flatMap((choice) => choice.options)
    expect(middle.some((option) => option.id.startsWith('stat-'))).toBe(true)
    expect(middle.some((option) => option.id === 'barbarian-hedonist')).toBe(true)
    expect(middle.some((option) => option.id === 'magic-item')).toBe(true)
    const secondMulticlass = { ...data, multiclassPaths: 'wizard-evoker' }
    expect(choicesAt(dw2.creation, 9, secondMulticlass).flatMap((choice) => choice.options).some((option) => option.id.startsWith('multiclass-'))).toBe(false)
    expect(choicesAt(dw2.creation, 10, secondMulticlass).flatMap((choice) => choice.options).some((option) => option.id.startsWith('multiclass-'))).toBe(true)
    expect(choicesAt(dw2.creation, 10, { ...data, magicItemAward: true }).flatMap((choice) => choice.options).some((option) => option.id === 'magic-item')).toBe(false)
  })
})

describe('Daggerheart', () => {
  it('offers domain-card advantage and requires three Hope for a Hope feature', () => {
    const character = bladesCharacter({ resources: { hope: 2 } })
    const derived = derive(character, dh)
    const domain = dh.actions.find((action) => action.category.startsWith('domain-') && action.steps.length)!
    expect(planMove(dh, domain, character, derived, { mode: 'advantage' }).formula).toContain('1d6[Advantage]')
    const hopeFeature = dh.actions.find((action) => action.id.startsWith('hope-'))!
    expect(() => performMove(dh, hopeFeature, character, derived)).toThrow('Not enough resources')
    const prepared = { ...character, resources: { hope: 3 } }
    expect(performMove(dh, hopeFeature, prepared, derive(prepared, dh)).resourcesSpent).toEqual([{ id: 'hope', by: -3 }])
  })

  it('models multiclass feature/domain/foundation acquisition and tier exclusions', () => {
    const data = { classId: 'guardian', domain1: 'Valor', domain2: 'Blade' }
    expect(choicesAt(dh.creation, 4, data).flatMap((choice) => choice.options).some((option) => option.id.startsWith('multiclass-'))).toBe(false)
    const option = choicesAt(dh.creation, 5, data).flatMap((choice) => choice.options).find((entry) => entry.id.startsWith('multiclass-bard-grace-'))!
    expect(option.cost).toBe(2)
    const character = bladesCharacter({ data: { ...data, ...option.grants, level: 5 } })
    const actions = dh.actionsFor(character, derive(character, dh))
    expect(actions.some((action) => action.id.startsWith('class-bard-'))).toBe(true)
    expect(actions.some((action) => action.id.startsWith('hope-bard-'))).toBe(false)
    const options = choicesAt(dh.creation, 6, character.data).flatMap((choice) => choice.options)
    expect(options.some((entry) => entry.id.startsWith('multiclass-'))).toBe(false)
    expect(options.filter((entry) => entry.requiresAny?.some((requirements) => requirements.multiclassDomain === 'Grace')).every((entry) => Number(entry.text.match(/^Level (\d+)/)?.[1] ?? 0) <= 3)).toBe(true)
  })

  it('uses adversary difficulty and thresholds and reduces damage severity with armor', () => {
    const adversary = bladesCharacter({ kind: 'npc', fields: { difficulty: 17, majorThreshold: 6, severeThreshold: 12 } })
    const derived = derive(adversary, dh)
    expect(derived.values).toMatchObject({ difficulty: 17, majorThreshold: 6, severeThreshold: 12 })
    expect([0, 5, 6, 12].map((amount) => dh.resolveDamage!(adversary, derived, amount, {}).hp)).toEqual([0, 1, 2, 3])
    const pc = bladesCharacter({ resources: { armor: 1 } })
    expect(dh.resolveDamage!(pc, derived, 12, { armor: true })).toEqual({ hp: 2, resources: [{ id: 'armor', by: -1 }] })
    expect(dh.resolveDamage!(pc, derived, 5, { armor: true }).hp).toBe(0)
  })

  it('loads the licensed core class, heritage, card, weapon, and armor data', () => {
    expect(checkSystem(dh)).toEqual([])
    expect(dh.creation?.choices.find((choice) => choice.id === 'class')?.options).toHaveLength(9)
    expect(dh.creation?.choices.find((choice) => choice.id === 'ancestry')?.options.length).toBeGreaterThan(10)
    expect(dh.items.some((item) => item.id === 'weapon-longsword')).toBe(true)
    expect(dh.items.some((item) => item.id === 'armor-gambeson-armor')).toBe(true)
    expect(dh.counters?.map((counter) => counter.id)).toContain('fear')
  })

  it('uses the Duality Dice and exposes Hope/Fear follow-ups against Difficulty', () => {
    const action = dh.actions.find((entry) => entry.id === 'trait-agility')!
    const c = bladesCharacter({ scores: { agility: 1 } })
    const failure = performMove(dh, action, c, derive(c, dh), { difficulty: 14 }, dice(3, 9))
    expect(failure.roll?.formula).toBe('1d12[Hope]+1d12[Fear]+1[AGI]')
    expect(failure.result).toBe('failure-fear')
    expect(failure.suggestions).toContainEqual(expect.objectContaining({ count: { systemCounter: 'fear', by: 1 } }))

    const critical = performMove(dh, action, c, derive(c, dh), { difficulty: 99 }, dice(7, 7))
    expect(critical.result).toBe('critical')
    expect(critical.suggestions.map((suggestion) => suggestion.id)).toEqual(['gain-hope', 'clear-stress'])
  })

  it('lets a character spend Hope to add a named Experience to a Daggerheart roll', () => {
    const action = dh.actions.find((entry) => entry.id === 'trait-agility')!
    const c = bladesCharacter({
      scores: { agility: 1 }, resources: { hope: 2 },
      data: { experience1Name: 'Cliff climber', experience1Bonus: 2 },
    })
    const result = performMove(dh, action, c, derive(c, dh), { difficulty: 12, rollBonuses: ['experience-1'] }, dice(7, 4))
    expect(result.roll?.formula).toBe('1d12[Hope]+1d12[Fear]+1[AGI]+2[Cliff climber]')
    expect(result.resourcesSpent).toEqual([{ id: 'hope', by: -1 }])
  })

  it('limits domain-card choices to the selected class domains and grants selected cards', () => {
    const classChoice = dh.creation!.choices.find((choice) => choice.id === 'class')!
    const bard = classChoice.options.find((option) => option.id === 'bard')!
    const data: Record<string, string | number | boolean> = { classId: bard.id, ...bard.grants }
    const choices = choicesAt(dh.creation, 'create', data)
    const cardChoice = choices.find((choice) => choice.id === 'domain-card-1')!
    expect(cardChoice.options.length).toBeGreaterThan(0)
    expect(cardChoice.options.every((option) => option.requiresAny?.some((requirements) => Object.entries(requirements).every(([key, value]) => data[key] === value)))).toBe(true)
    const selected = (cardChoice.options)[0]!
    const c = bladesCharacter({ data: { ...data, domainCards: selected.id, activeDomainCards: selected.id } })
    const granted = dh.actions.find((action) => action.id.endsWith(selected.id))!
    expect(dh.actionsFor(c, derive(c, dh)).map((action) => action.id)).toContain(granted.id)
  })

  it('offers two tiered advancements and only improves named Experiences', () => {
    expect(dh.creation?.choicesPerAdvancement).toBe(2)
    const choices = choicesAt(dh.creation, 2, { experience1Name: 'Cliff climber', experience2Name: 'Courtier' })
    const slots = choices.filter((choice) => choice.id.startsWith('advancement-2-'))
    expect(slots).toHaveLength(2)
    const firstSlot = (slots)[0]!
    expect(firstSlot.options.some((option) => option.id === 'improve-experiences-1-2')).toBe(true)
    expect(firstSlot.options.some((option) => option.id === 'improve-experiences-1-3')).toBe(false)
    expect(firstSlot.options.find((option) => option.id === 'improve-experiences-1-2')?.dataBoost).toEqual([{ field: 'experience1Bonus', by: 1 }, { field: 'experience2Bonus', by: 1 }])
    const subclassChoice = dh.creation!.choices.find((choice) => choice.id === 'subclass')!
    const subclass = (subclassChoice.options)[0]!
    expect(choicesAt(dh.creation, 5, { subclassId: subclass.id, classId: String(subclass.requires?.classId) }).flatMap((choice) => choice.options).some((option) => option.id === 'subclass-specialization')).toBe(true)
  })

  it('treats a matching Duality result as a hit even above the target Difficulty', () => {
    const attack = dh.actions.find((entry) => entry.id === 'attack-longsword')!
    const c = bladesCharacter({ scores: { agility: 1 } })
    const result = performMove(dh, attack, c, derive(c, dh), {}, dice(6, 6), {
      targets: [{ id: 'target', name: 'Target' }],
      valueAt: () => 99,
    })
    expect(result.targets?.[0]).toMatchObject({ result: 'critical', hit: true, against: 99 })
    expect(result.suggestions.map((suggestion) => suggestion.id)).toContain('weapon-critical-damage-longsword')
  })

  it('registers Daggerheart with the other built-in systems', () => {
    expect(listSystems().map((system) => system.id)).toContain('daggerheart')
  })
})

describe('resolveEffects', () => {
  it('applies set, then add, then multiply, then clamps', () => {
    const r = resolveEffects(
      { armor: 0 },
      [
        { name: 'Cap', effects: [{ type: 'modify', path: 'armor', op: 'max', value: 5 }] },
        { name: 'Double', effects: [{ type: 'modify', path: 'armor', op: 'multiply', value: 2 }] },
        { name: 'Mail', effects: [{ type: 'modify', path: 'armor', op: 'add', value: 2 }] },
        { name: 'Base', effects: [{ type: 'modify', path: 'armor', op: 'set', value: 1 }] },
      ],
    )
    // set 1, add 2 → 3, multiply 2 → 6, max 5 → 5
    expect(r.values.armor).toBe(5)
    expect(r.why.armor).toEqual(['Base: 0 → 1', 'Mail: 1 → 3', 'Double: 3 → 6', 'Cap: 6 → 5'])
  })

  it('orders by priority before phase', () => {
    const r = resolveEffects(
      { x: 1 },
      [
        { name: 'late', effects: [{ type: 'modify', path: 'x', op: 'set', value: 9, priority: 1 }] },
        { name: 'early', effects: [{ type: 'modify', path: 'x', op: 'add', value: 1 }] },
      ],
    )
    expect(r.values.x).toBe(9)
  })

  it('collects granted moves, tags and roll bonuses once', () => {
    const r = resolveEffects({}, [
      {
        name: 'Holy Symbol',
        effects: [
          { type: 'grantMove', move: 'turn-undead' },
          { type: 'grantMove', move: 'turn-undead' },
          { type: 'grantTag', tag: 'holy' },
          { type: 'rollBonus', moves: ['hack-and-slash'], value: 1 },
        ],
      },
    ])
    expect(r.moves).toEqual(['turn-undead'])
    expect(r.tags).toEqual(['holy'])
    expect(r.bonuses).toEqual([{ source: 'Holy Symbol', stat: undefined, moves: ['hack-and-slash'], value: 1 }])
  })

  it('is the same whichever order sources arrive in', () => {
    const a = { name: 'A', effects: [{ type: 'modify', path: 'x', op: 'add', value: 2 } as const] }
    const b = { name: 'B', effects: [{ type: 'modify', path: 'x', op: 'multiply', value: 3 } as const] }
    expect(resolveEffects({ x: 1 }, [a, b]).values.x).toBe(resolveEffects({ x: 1 }, [b, a]).values.x)
  })
})

describe('Dungeon World data', () => {
  it('maps scores to modifiers', () => {
    const m = dw.modifier
    expect([3, 4, 5, 6, 8, 9, 12, 13, 15, 16, 17, 18].map(m)).toEqual([-3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 2, 3])
  })

  it('bands 2d6 results', () => {
    expect([12, 10, 9, 7, 6, 2].map((t) => dw.result(t, []))).toEqual(['strong', 'strong', 'weak', 'weak', 'miss', 'miss'])
    expect(dw.results.map((r) => r.label)).toEqual(['Full success', 'Partial success', 'Miss'])
  })

  it('has unique ids, and every rolled move has outcomes for each band', () => {
    const ids = dw.actions.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of dw.actions)
      for (const step of m.steps) {
        if (step.kind !== "check") continue;
        for (const r of dw.results)
          expect(step.outcomes[r.id], `${m.id} ${r.id}`).toBeDefined();
        if (step.stat)
          expect(
            dw.stats.some((s) => s.id === step.stat),
            m.id,
          ).toBe(true);
        for (const ids of Object.values(step.followUps ?? {}))
          for (const f of ids)
            expect(
              dw.followUps.some((x) => x.id === f),
              `${m.id} ${f}`,
            ).toBe(true);
      }
    for (const m of dw.actions) expect(dw.actionCategories.some((k) => k.id === m.category), m.id).toBe(true)
  })

  it("offers eight classes as plugin creation options", () => {
    expect(
      dw.creation?.choices.find((choice) => choice.id === "class")?.options,
    ).toHaveLength(8);
  });
})

describe('tokenStats', () => {
  it('shows HP as a bar that changes colour as it drops', () => {
    const stats = (hp: number) => (dw.tokenStats({ resources: { hp } } as never, { values: { maxHp: 16 } } as never))[0]!
    expect(stats(16)).toMatchObject({ id: 'hp', value: 16, max: 16 })
    expect(new Set([stats(16).colour, stats(8).colour, stats(4).colour]).size).toBe(3)
  })
})

describe('checking a system', () => {
  it('finds nothing wrong with Dungeon World', () => {
    expect(checkSystem(dw)).toEqual([])
  })

  it('names what does not hold together', () => {
    const broken = {
      ...dw,
      actions: [
        ...dw.actions,
        { ...(dw.actions)[0]!, id: (dw.actions)[0]!.id },
        { id: 'odd', name: 'Odd', category: 'nope', trigger: '', text: '', steps: [{ kind: 'check' as const, stat: 'luck', outcomes: {} }] },
      ],
    }
    const problems = checkSystem(broken)
    expect(problems).toContain(`Two actions share the id “${(dw.actions)[0]!.id}”.`)
    expect(problems).toContain('Odd: no action category “nope”.')
    expect(problems).toContain('Odd: no stat “luck”.')
    expect(problems).toContain('Odd: no outcome for “Full success”.')
    expect(() => defineSystem(broken)).toThrow(/has problems/)
  })
})
