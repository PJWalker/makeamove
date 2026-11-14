import type { Characters } from "../../campaign/schema";

/*
 * Relationships between characters: each character keeps `relationships`,
 * other character id -> how they see them ("Owes a debt to"), with notes in
 * a rich-text field of its own (`rel:<id>`). They're one-way, as people see
 * each other: Ayla can trust Brom while Brom resents Ayla.
 */

export interface Relationship {
  /** The other character. */
  to: string;
  /** How this character sees them, in a few words. */
  label: string;
  /** How deep it runs, for systems that rate relationships (see GameSystem.relationshipDepth). */
  depth?: number;
}

/** An arrow in the web: from one character to another. */
export interface RelationshipEdge extends Relationship {
  from: string;
}

/** The notes field for one relationship. */
export const relationshipNotes = (to: string) => `rel:${to}`;

export function relationshipsOf(characters: Characters, id: string): Relationship[] {
  return (characters.get(id)?.get("relationships")?.entries() ?? []).flatMap(([to, r]) =>
    characters.has(to) ? [{ to, label: r.label, depth: r.depth ?? 0 }] : [],
  );
}

export function setRelationship(characters: Characters, from: string, to: string, label: string) {
  if (from === to) return;
  const rel = characters.get(from)?.ensure("relationships");
  rel?.set(to, { label, depth: rel.get(to)?.depth ?? 0 });
}

/** Set a relationship's depth, from 0 to the system's maximum. */
export function setRelationshipDepth(
  characters: Characters,
  from: string,
  to: string,
  depth: number,
  max: number,
) {
  const rel = characters.get(from)?.get("relationships");
  const current = rel?.get(to);
  if (!current) return;
  rel?.set(to, { ...current, depth: Math.max(0, Math.min(max, Math.trunc(depth))) });
}

export function removeRelationship(characters: Characters, from: string, to: string) {
  const m = characters.get(from);
  characters.transact(() => {
    m?.get("relationships")?.delete(to);
    m?.get("texts")?.delete(relationshipNotes(to));
  });
}

/** Every relationship between characters in `ids`, for the graph. */
export function relationshipWeb(characters: Characters, ids: string[]): RelationshipEdge[] {
  const known = new Set(ids);
  return ids.flatMap((from) =>
    relationshipsOf(characters, from).flatMap((r) => (known.has(r.to) ? [{ from, ...r }] : [])),
  );
}

export interface NodePosition {
  x: number;
  y: number;
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
  {
    width = 600,
    height = 400,
    fixed = {},
    steps = 300,
  }: { width?: number; height?: number; fixed?: Record<string, NodePosition>; steps?: number } = {},
): Record<string, NodePosition> {
  const pos: Record<string, NodePosition> = {};
  const point = (positions: Record<string, NodePosition>, id: string) => {
    const value = positions[id];
    if (!value) throw new Error(`Missing relationship position: ${id}`);
    return value;
  };
  const r = Math.min(width, height) * 0.35;
  ids.forEach((id, i) => {
    const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
    pos[id] = fixed[id]
      ? { ...fixed[id] }
      : { x: width / 2 + r * Math.cos(a), y: height / 2 + r * Math.sin(a) };
  });
  const ideal = Math.max(90, Math.sqrt((width * height) / Math.max(1, ids.length)) * 0.8);
  for (let step = 0; step < steps; step++) {
    const heat = 1 - step / steps;
    const force: Record<string, NodePosition> = Object.fromEntries(
      ids.map((id) => [id, { x: 0, y: 0 }]),
    );
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const fromId = ids[i]!;
        const toId = ids[j]!;
        const a = point(pos, fromId);
        const b = point(pos, toId);
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = 0.01 * (i - j);
          dy = 0.01;
          d = Math.hypot(dx, dy);
        }
        const push = (ideal * ideal) / d;
        point(force, fromId).x += (dx / d) * push;
        point(force, fromId).y += (dy / d) * push;
        point(force, toId).x -= (dx / d) * push;
        point(force, toId).y -= (dy / d) * push;
      }
    }
    for (const e of edges) {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const pull = (d * d) / ideal;
      point(force, e.from).x -= (dx / d) * pull;
      point(force, e.from).y -= (dy / d) * pull;
      point(force, e.to).x += (dx / d) * pull;
      point(force, e.to).y += (dy / d) * pull;
    }
    for (const id of ids) {
      if (fixed[id]) continue;
      const f = point(force, id);
      const current = point(pos, id);
      // Towards the middle, so loose characters don't wander off.
      f.x += (width / 2 - current.x) * 0.05;
      f.y += (height / 2 - current.y) * 0.05;
      const m = Math.hypot(f.x, f.y);
      const limit = 12 * heat + 0.5;
      if (m > limit) {
        f.x = (f.x / m) * limit;
        f.y = (f.y / m) * limit;
      }
      current.x = Math.min(width - 40, Math.max(40, current.x + f.x));
      // Room below for the name.
      current.y = Math.min(height - 45, Math.max(30, current.y + f.y));
    }
  }
  return pos;
}
