import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { layoutWeb, relationshipsOf, relationshipWeb, removeRelationship, setRelationship } from '../relationships'

function cast(...ids: string[]) {
  const characters = new Y.Doc().getMap<Y.Map<any>>('characters')
  for (const id of ids) characters.set(id, new Y.Map())
  return characters
}

describe('relationships', () => {
  it('are one-way, labelled, and gone with their notes when removed', () => {
    const chars = cast('ayla', 'brom', 'cass')
    setRelationship(chars, 'ayla', 'brom', 'Trusts')
    setRelationship(chars, 'brom', 'ayla', 'Resents')
    setRelationship(chars, 'ayla', 'ayla', 'Loves')
    expect(relationshipsOf(chars, 'ayla')).toEqual([{ to: 'brom', label: 'Trusts' }])
    chars.get('ayla')!.set('text:rel:brom', new Y.XmlFragment())
    removeRelationship(chars, 'ayla', 'brom')
    expect(relationshipsOf(chars, 'ayla')).toEqual([])
    expect(chars.get('ayla')!.has('text:rel:brom')).toBe(false)
  })

  it('leave out characters that are gone or not shown', () => {
    const chars = cast('ayla', 'brom', 'cass')
    setRelationship(chars, 'ayla', 'brom', 'Trusts')
    setRelationship(chars, 'ayla', 'cass', 'Fears')
    chars.delete('cass')
    expect(relationshipsOf(chars, 'ayla').map((r) => r.to)).toEqual(['brom'])
    expect(relationshipWeb(chars, ['ayla'])).toEqual([])
  })

  it('lays the web out inside the box, keeping fixed nodes where they are', () => {
    const ids = ['a', 'b', 'c', 'd']
    const edges = [{ from: 'a', to: 'b', label: '' }]
    const pos = layoutWeb(ids, edges, { width: 500, height: 300, fixed: { d: { x: 50, y: 50 } } })
    expect(pos.d).toEqual({ x: 50, y: 50 })
    for (const id of ids) {
      expect(pos[id].x).toBeGreaterThanOrEqual(40)
      expect(pos[id].x).toBeLessThanOrEqual(460)
    }
    // Related characters end up closer than unrelated ones.
    const dist = (p: string, q: string) => Math.hypot(pos[p].x - pos[q].x, pos[p].y - pos[q].y)
    expect(dist('a', 'b')).toBeLessThan(dist('a', 'c'))
  })
})
