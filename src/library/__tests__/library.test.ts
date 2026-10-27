import { describe, expect, it } from 'vitest'
import { instanceOf } from '../../characters/store'
import { dungeonWorld } from '../../systems/dungeon-world'
import { librariesFor, registerLibrary, searchEntries, systemLibrary } from '../index'

describe('libraries', () => {
  it("collects a system's gear, moves by category, classes and tags", () => {
    const lib = systemLibrary(dungeonWorld)
    expect(lib.from).toBe('system')
    const kinds = lib.collections.map((c) => c.kind)
    expect(kinds).toContain('item')
    expect(kinds).toContain('move')
    expect(kinds).toContain('class')
    const gear = lib.collections.find((c) => c.kind === 'item')!
    expect(gear.entries).toHaveLength(dungeonWorld.items.length)
    const moves = lib.collections.filter((c) => c.kind === 'move').flatMap((c) => c.entries)
    expect(moves).toHaveLength(dungeonWorld.actions.length)
  })

  it('carries icons from definitions to entries and inventory items', () => {
    const lib = systemLibrary(dungeonWorld)
    const dagger = lib.collections.flatMap((c) => c.entries).find((e) => e.id === 'dagger')!
    expect(dagger.icon).toBe('dagger')
    const classMove = lib.collections.find((c) => c.id === 'moves-class')!.entries[0]
    expect(classMove.icon).toBe('class-move')
    expect(instanceOf(dungeonWorld.items.find((i) => i.id === 'dagger')!, 'a0').icon).toBe('dagger')
  })

  it('adds and removes plugin libraries after the system', () => {
    const remove = registerLibrary({
      id: 'trinkets',
      name: 'Trinkets',
      from: 'plugin',
      collections: [{ id: 'all', name: 'Trinkets', kind: 'tag', entries: [] }],
    })
    expect(librariesFor(dungeonWorld).map((s) => s.id)).toEqual([`system:${dungeonWorld.id}`, 'trinkets'])
    remove()
    expect(librariesFor(dungeonWorld).map((s) => s.id)).toEqual([`system:${dungeonWorld.id}`])
  })

  it('searches names before tags before text', () => {
    const entry = (id: string, name: string, tags: string[], text: string) =>
      ({ kind: 'tag', id, name, tags, text, tag: { id, name, text } }) as const
    const entries = [entry('a', 'Lantern', [], 'Light in a rope-handled case'), entry('b', 'Kit', ['rope'], ''), entry('c', 'Rope', [], '')]
    expect(searchEntries(entries, 'rope').map((e) => e.id)).toEqual(['c', 'b', 'a'])
    expect(searchEntries(entries, 'sword')).toEqual([])
    expect(searchEntries(entries, '  ')).toBe(entries)
  })
})
