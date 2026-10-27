import * as Y from 'yjs'

/*
 * Relationships between characters: each character keeps a `relationships`
 * map of other character id -> how they see them ("Owes a debt to"), with
 * notes in a rich-text field of its own (`text:rel:<id>`). They're one-way,
 * as people see each other: Ayla can trust Brom while Brom resents Ayla.
 */

export interface Relationship {
  /** The other character. */
  to: string
  /** How this character sees them, in a few words. */
  label: string
}

/** An arrow in the web: from one character to another. */
export interface RelationshipEdge extends Relationship {
  from: string
}

/** The notes field for one relationship. */
export const relationshipNotes = (to: string) => `rel:${to}`

function mapOf(characters: Y.Map<Y.Map<any>>, id: string, create: boolean): Y.Map<{ label: string }> | undefined {
  const m = characters.get(id)
  if (!m) return undefined
  let rel = m.get('relationships') as Y.Map<{ label: string }> | undefined
  if (!(rel instanceof Y.Map) && create) {
    rel = new Y.Map()
    m.set('relationships', rel)
  }
  return rel instanceof Y.Map ? rel : undefined
}

export function relationshipsOf(characters: Y.Map<Y.Map<any>>, id: string): Relationship[] {
  const rel = mapOf(characters, id, false)
  return rel ? [...rel.entries()].filter(([to]) => characters.has(to)).map(([to, r]) => ({ to, label: r.label })) : []
}

export function setRelationship(characters: Y.Map<Y.Map<any>>, from: string, to: string, label: string) {
  if (from === to) return
  mapOf(characters, from, true)?.set(to, { label })
}

export function removeRelationship(characters: Y.Map<Y.Map<any>>, from: string, to: string) {
  const m = characters.get(from)
  characters.doc!.transact(() => {
    mapOf(characters, from, false)?.delete(to)
    m?.delete(`text:${relationshipNotes(to)}`)
  })
}

/** Every relationship between characters in `ids`, for the graph. */
export function relationshipWeb(characters: Y.Map<Y.Map<any>>, ids: string[]): RelationshipEdge[] {
  const known = new Set(ids)
  return ids.flatMap((from) => relationshipsOf(characters, from).filter((r) => known.has(r.to)).map((r) => ({ from, ...r })))
}

export interface NodePosition {
  x: number
  y: number
}

/**
 * Lay out the web with a small force simulation: every pair pushes apart,
 * each relationship pulls its two ends together, and everything drifts to
 * the middle. Positions it's given (dragged nodes) stay put. Deterministic:
 * nodes start on a circle in the order given.
 */
export function layoutWeb(
  ids: string[],
  edges: RelationshipEdge[],
  { width = 600, height = 400, fixed = {} as Record<string, NodePosition>, steps = 300 } = {},
): Record<string, NodePosition> {
  const pos: Record<string, NodePosition> = {}
  const r = Math.min(width, height) * 0.35
  ids.forEach((id, i) => {
    const a = (i / Math.max(1, ids.length)) * Math.PI * 2
    pos[id] = fixed[id] ? { ...fixed[id] } : { x: width / 2 + r * Math.cos(a), y: height / 2 + r * Math.sin(a) }
  })
  const ideal = Math.max(90, Math.sqrt((width * height) / Math.max(1, ids.length)) * 0.8)
  for (let step = 0; step < steps; step++) {
    const heat = 1 - step / steps
    const force: Record<string, NodePosition> = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]))
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]]
        const b = pos[ids[j]]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d = Math.hypot(dx, dy)
        if (d < 0.01) {
          dx = 0.01 * (i - j)
          dy = 0.01
          d = Math.hypot(dx, dy)
        }
        const push = (ideal * ideal) / d
        force[ids[i]].x += (dx / d) * push
        force[ids[i]].y += (dy / d) * push
        force[ids[j]].x -= (dx / d) * push
        force[ids[j]].y -= (dy / d) * push
      }
    }
    for (const e of edges) {
      const a = pos[e.from]
      const b = pos[e.to]
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d = Math.max(0.01, Math.hypot(dx, dy))
      const pull = (d * d) / ideal
      force[e.from].x -= (dx / d) * pull
      force[e.from].y -= (dy / d) * pull
      force[e.to].x += (dx / d) * pull
      force[e.to].y += (dy / d) * pull
    }
    for (const id of ids) {
      if (fixed[id]) continue
      const f = force[id]
      // Towards the middle, so loose characters don't wander off.
      f.x += (width / 2 - pos[id].x) * 0.05
      f.y += (height / 2 - pos[id].y) * 0.05
      const m = Math.hypot(f.x, f.y)
      const limit = 12 * heat + 0.5
      if (m > limit) {
        f.x = (f.x / m) * limit
        f.y = (f.y / m) * limit
      }
      pos[id].x = Math.min(width - 40, Math.max(40, pos[id].x + f.x))
      // Room below for the name.
      pos[id].y = Math.min(height - 45, Math.max(30, pos[id].y + f.y))
    }
  }
  return pos
}
