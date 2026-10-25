import { describe, expect, it } from 'vitest'
import { splitSessions } from '../sessions'
import { canDelete, type ChatMessage } from '../types'

let n = 0
const text = (t: string, author = 'pat'): ChatMessage => ({ kind: 'text', text: t, id: `m${n++}`, hlc: `${n}`, author, name: author })
const marker = (session: number, end = false): ChatMessage => ({
  kind: 'system',
  text: `Session ${session} ${end ? 'ends' : 'begins'}`,
  event: end ? 'session-end' : 'session-start',
  session,
  id: `s${session}${end ? 'e' : ''}`,
  hlc: `${n++}`,
  author: 'gm',
  name: 'Gwen',
})

describe('splitting the log into sessions', () => {
  it('is one current part when there are no markers', () => {
    const parts = splitSessions([text('a'), text('b')])
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ key: 'before', marker: null, current: true })
  })
  it('starts a part at each session, with ends and stragglers in the session they follow', () => {
    const parts = splitSessions([text('pre'), marker(1), text('one'), marker(1, true), text('after one'), marker(2), text('two')])
    expect(parts.map((p) => [p.key, p.messages.length, p.current])).toEqual([
      ['before', 1, false],
      ['s1', 3, false],
      ['s2', 1, true],
    ])
  })
  it('has no empty "before" part when the log opens with a marker', () => {
    expect(splitSessions([marker(1), text('x')]).map((p) => p.key)).toEqual(['s1'])
  })
})

describe('deleting', () => {
  it('lets players delete their own messages, and the GM anyone’s', () => {
    const m = text('oops', 'pat')
    expect(canDelete(m, 'pat', false)).toBe(true)
    expect(canDelete(m, 'lee', false)).toBe(false)
    expect(canDelete(m, 'gm', true)).toBe(true)
  })
})
