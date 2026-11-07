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
  /** Dungeon World 2 relationship Depth, from 0 to 3. */
  depth?: number
}

/** An arrow in the web: from one character to another. */
export interface RelationshipEdge extends Relationship {
  from: string
}

export interface SharedBond {
  first: string
  second: string
  type: string
  advancedMoves: string[]
}

/** The notes field for one relationship. */
export const relationshipNotes = (to: string) => `rel:${to}`
const bondsKey = 'dungeon-world-2:bonds'
const pairKey = (first: string, second: string) => [first, second].sort().join(':')

function mapOf(characters: Y.Map<Y.Map<any>>, id: string, create: boolean): Y.Map<{ label: string; depth?: number }> | undefined {
  const m = characters.get(id)
  if (!m) return undefined
  let rel = m.get('relationships') as Y.Map<{ label: string; depth?: number }> | undefined
  if (!(rel instanceof Y.Map) && create) {
    rel = new Y.Map()
    m.set('relationships', rel)
  }
  return rel instanceof Y.Map ? rel : undefined
}

export function relationshipsOf(characters: Y.Map<Y.Map<any>>, id: string): Relationship[] {
  const rel = mapOf(characters, id, false)
  return rel ? [...rel.entries()].filter(([to]) => characters.has(to)).map(([to, r]) => ({ to, label: r.label, depth: r.depth ?? 0 })) : []
}

export function setRelationship(characters: Y.Map<Y.Map<any>>, from: string, to: string, label: string) {
  if (from === to) return
  const rel = mapOf(characters, from, true)
  rel?.set(to, { label, depth: rel.get(to)?.depth ?? 0 })
}

export function setRelationshipDepth(characters: Y.Map<Y.Map<any>>, from: string, to: string, depth: number) {
  const rel = mapOf(characters, from, false)
  const current = rel?.get(to)
  if (!current) return
  rel?.set(to, { ...current, depth: Math.max(0, Math.min(3, Math.trunc(depth))) })
}

export function removeRelationship(characters: Y.Map<Y.Map<any>>, from: string, to: string) {
  const m = characters.get(from)
  characters.doc!.transact(() => {
    mapOf(characters, from, false)?.delete(to)
    m?.delete(`text:${relationshipNotes(to)}`)
  })
}

function bondsOf(systemData: Y.Map<any>, create: boolean): Y.Map<SharedBond> | undefined {
  let bonds = systemData.get(bondsKey) as Y.Map<SharedBond> | undefined
  if (!(bonds instanceof Y.Map) && create) {
    bonds = new Y.Map()
    systemData.set(bondsKey, bonds)
  }
  return bonds instanceof Y.Map ? bonds : undefined
}

export function bondBetween(
  systemData: Y.Map<any>,
  first: string,
  second: string,
): SharedBond | undefined {
  const bond = bondsOf(systemData, false)?.get(pairKey(first, second))
  return bond ? { ...bond, advancedMoves: [...bond.advancedMoves] } : undefined
}

export function bondsFor(systemData: Y.Map<any>, characterId: string): SharedBond[] {
  return [...(bondsOf(systemData, false)?.values() ?? [])]
    .filter((bond) => bond.first === characterId || bond.second === characterId)
    .map((bond) => ({ ...bond, advancedMoves: [...bond.advancedMoves] }))
}

/** Forge or reinforce the shared Bond after both PCs reach Depth 3. */
export function forgeBond(
  systemData: Y.Map<any>,
  characters: Y.Map<Y.Map<any>>,
  first: string,
  second: string,
  type: string,
): boolean {
  if (first === second || !characters.has(first) || !characters.has(second))
    return false
  const firstDepth = relationshipsOf(characters, first).find((r) => r.to === second)?.depth ?? 0
  const secondDepth = relationshipsOf(characters, second).find((r) => r.to === first)?.depth ?? 0
  if (firstDepth < 3 || secondDepth < 3) return false

  const [pairFirst, pairSecond] = [first, second].sort()
  const existing = bondBetween(systemData, first, second)
  const bond: SharedBond = {
    first: pairFirst!,
    second: pairSecond!,
    type,
    advancedMoves: existing?.type === type ? existing.advancedMoves : [],
  }
  const bonds = bondsOf(systemData, true)
  if (!bonds) return false
  characters.doc!.transact(() => {
    bonds.set(pairKey(first, second), bond)
    removeRelationship(characters, first, second)
    removeRelationship(characters, second, first)
    if (existing && existing.type !== type) {
      for (const id of [first, second]) {
        const data = characters.get(id)?.get('data') as Y.Map<any> | undefined
        if (data && existing.advancedMoves.length) {
          data.set('xp', Number(data.get('xp') ?? 0) + existing.advancedMoves.length)
        }
      }
    }
  })
  return true
}

export function advanceBond(
  systemData: Y.Map<any>,
  characters: Y.Map<Y.Map<any>>,
  first: string,
  second: string,
  moveId: string,
): boolean {
  const bonds = bondsOf(systemData, false)
  const key = pairKey(first, second)
  const current = bonds?.get(key)
  if (!bonds || !current || current.advancedMoves.includes(moveId)) return false
  const firstDepth = relationshipsOf(characters, first).find((r) => r.to === second)?.depth ?? 0
  const secondDepth = relationshipsOf(characters, second).find((r) => r.to === first)?.depth ?? 0
  if (firstDepth < 3 || secondDepth < 3) return false
  bonds.set(key, {
    ...current,
    advancedMoves: [...current.advancedMoves, moveId],
  })
  removeRelationship(characters, first, second)
  removeRelationship(characters, second, first)
  return true
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
  const point = (positions: Record<string, NodePosition>, id: string) => {
    const value = positions[id];
    if (!value) throw new Error(`Missing relationship position: ${id}`);
    return value;
  };
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
        const fromId = (ids)[i]!;
        const toId = (ids)[j]!;
        const a = point(pos, fromId)
        const b = point(pos, toId)
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d = Math.hypot(dx, dy)
        if (d < 0.01) {
          dx = 0.01 * (i - j)
          dy = 0.01
          d = Math.hypot(dx, dy)
        }
        const push = (ideal * ideal) / d
        point(force, fromId).x += (dx / d) * push
        point(force, fromId).y += (dy / d) * push
        point(force, toId).x -= (dx / d) * push
        point(force, toId).y -= (dy / d) * push
      }
    }
    for (const e of edges) {
      const a = pos[e.from]
      const b = pos[e.to]
      if (!a || !b) continue;
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d = Math.max(0.01, Math.hypot(dx, dy))
      const pull = (d * d) / ideal
      point(force, e.from).x -= (dx / d) * pull
      point(force, e.from).y -= (dy / d) * pull
      point(force, e.to).x += (dx / d) * pull
      point(force, e.to).y += (dy / d) * pull
    }
    for (const id of ids) {
      if (fixed[id]) continue
      const f = point(force, id)
      const current = point(pos, id)
      // Towards the middle, so loose characters don't wander off.
      f.x += (width / 2 - current.x) * 0.05
      f.y += (height / 2 - current.y) * 0.05
      const m = Math.hypot(f.x, f.y)
      const limit = 12 * heat + 0.5
      if (m > limit) {
        f.x = (f.x / m) * limit
        f.y = (f.y / m) * limit
      }
      current.x = Math.min(width - 40, Math.max(40, current.x + f.x))
      // Room below for the name.
      current.y = Math.min(height - 45, Math.max(30, current.y + f.y))
    }
  }
  return pos
}
