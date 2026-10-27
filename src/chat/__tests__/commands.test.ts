import { describe, expect, it } from 'vitest'
import { parseCommand, splitFormula, suggest } from '../commands'
import { entityToken, tokenize } from '../markdown'

const members = [
  { id: 'g', name: 'Gwen', role: 'gm' },
  { id: 'r', name: 'Robin', role: 'player' },
  { id: 'rh', name: 'Robin Hood', role: 'player' },
]

describe('commands', () => {
  it('sends plain text, and // escapes a slash', () => {
    expect(parseCommand(' hello ', members, false)).toEqual({ kind: 'text', text: 'hello' })
    expect(parseCommand('//shrug', members, false)).toEqual({ kind: 'text', text: '/shrug' })
  })
  it('rolls with a comment, and picks visibility from the command', () => {
    expect(parseCommand('/r 2d6 + 1 hack and slash', members, false)).toEqual({
      kind: 'roll',
      formula: '2d6 + 1',
      comment: 'hack and slash',
      visibility: 'public',
    })
    expect(parseCommand('/sr d20', members, false)).toMatchObject({ visibility: 'private' })
    expect(parseCommand('/gm d20', members, false)).toMatchObject({ kind: 'error' })
  })
  it('keeps labels with spaces in the formula', () => {
    expect(splitFormula('1d4+1[Ring of Strength] for the door')).toEqual({
      formula: '1d4+1[Ring of Strength]',
      comment: 'for the door',
    })
  })
  it('explains bad rolls', () => {
    expect(parseCommand('/r', members, false)).toMatchObject({ kind: 'error' })
    expect(parseCommand('/r banana', members, false)).toMatchObject({ kind: 'error' })
  })
  it('whispers to the longest matching name, or to the GM', () => {
    expect(parseCommand('/w robin hood psst', members, false)).toMatchObject({ kind: 'whisper', to: [{ id: 'rh' }], text: 'psst' })
    expect(parseCommand('/w Robin psst', members, false)).toMatchObject({ to: [{ id: 'r' }] })
    expect(parseCommand('/w gm I steal it', members, false)).toMatchObject({ to: [{ id: 'g' }], text: 'I steal it' })
    expect(parseCommand('/w Nobody hi', members, false)).toMatchObject({ kind: 'error' })
    expect(parseCommand('/w Robin', members, false)).toMatchObject({ kind: 'error' })
  })
  it('keeps GM commands from players', () => {
    expect(parseCommand('/session start', members, true)).toEqual({ kind: 'session', action: 'start' })
    expect(parseCommand('/session start', members, false)).toMatchObject({ kind: 'error' })
    expect(suggest('/se', false)).toEqual([])
    expect(suggest('/se', true).map((c) => c.names[0])).toEqual(['session'])
  })
  it('does emotes and help', () => {
    expect(parseCommand('/me waves', members, false)).toEqual({ kind: 'emote', text: 'waves' })
    expect(parseCommand('/help', members, false)).toEqual({ kind: 'help' })
    expect(parseCommand('/nope', members, false)).toMatchObject({ kind: 'error' })
  })
})

describe('markdown-lite', () => {
  it('splits styles, code and links', () => {
    expect(tokenize('a **b** *c* _d_ `e` [f](https://x.y) https://z.w/p.')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'd' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'e' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'f', href: 'https://x.y' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'https://z.w/p', href: 'https://z.w/p' },
      { type: 'text', text: '.' },
    ])
  })
  it('leaves snake_case and unsafe links alone', () => {
    expect(tokenize('my_var_name')).toEqual([{ type: 'text', text: 'my_var_name' }])
    expect(tokenize('[x](javascript:alert(1))')).toEqual([{ type: 'text', text: '[x](javascript:alert(1))' }])
  })
  it('reads links to things in the campaign', () => {
    const text = `Take ${entityToken('item', 'healing-potion')} to ${entityToken('character', 'c1', 'the chief')}`
    expect(tokenize(text)).toEqual([
      { type: 'text', text: 'Take ' },
      { type: 'entity', kind: 'item', id: 'healing-potion', text: '' },
      { type: 'text', text: ' to ' },
      { type: 'entity', kind: 'character', id: 'c1', text: 'the chief' },
    ])
  })
})
