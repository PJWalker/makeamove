/*
 * Where each panel is: docked on the left or right, floating in a window, or
 * closed. Proved to keep every panel in exactly one place: moving one never
 * loses it, duplicates it, or disturbs any other panel.
 */

export type Place = "closed" | "floating" | "left" | "right";

/** Panel ids at each place, in order. */
export interface Placement {
  left: string[];
  right: string[];
  floating: string[];
  closed: string[];
}

/** How many times `id` appears in `ids`. */
export function occurrences(ids: string[], id: string): number {
  //@ verify
  //@ decreases ids.length
  if (ids.length === 0) return 0;
  return (ids[0] === id ? 1 : 0) + occurrences(ids.slice(1), id);
}

/** How many places hold `id`, counting repeats. */
export function count(p: Placement, id: string): number {
  //@ verify
  return (
    occurrences(p.left, id) +
    occurrences(p.right, id) +
    occurrences(p.floating, id) +
    occurrences(p.closed, id)
  );
}

/** The ids at `place`. */
export function at(p: Placement, place: Place): string[] {
  //@ verify
  if (place === "left") return p.left;
  if (place === "right") return p.right;
  if (place === "floating") return p.floating;
  return p.closed;
}

/** `ids` without `id`. */
export function removed(ids: string[], id: string): string[] {
  //@ verify
  //@ decreases ids.length
  //@ ensures occurrences(\result, id) === 0
  //@ ensures forall(x: string, x !== id ==> occurrences(\result, x) === occurrences(ids, x))
  if (ids.length === 0) return [];
  const rest = removed(ids.slice(1), id);
  return ids[0] === id ? rest : [ids[0]!, ...rest];
}

/** `ids` with `id` inserted at `index`, clamped to the list. */
export function inserted(ids: string[], index: number, id: string): string[] {
  //@ verify
  //@ ensures occurrences(\result, id) === occurrences(ids, id) + 1
  //@ ensures forall(x: string, x !== id ==> occurrences(\result, x) === occurrences(ids, x))
  const i = Math.min(Math.max(index, 0), ids.length);
  return [...ids.slice(0, i), id, ...ids.slice(i)];
}

/** A place, and a position among the ids there. */
export interface Destination {
  place: Place;
  index: number;
}

/**
 * Move `id` to `to`, at `index` among the ids there (after the others when
 * `index` is past the end). Wherever it was, it is then only at `to`, and
 * every other panel stays where it was.
 */
export function moved(p: Placement, id: string, to: Destination): Placement {
  //@ verify
  //@ ensures count(\result, id) === 1
  //@ ensures occurrences(at(\result, to.place), id) === 1
  //@ ensures forall(x: string, x !== id ==> count(\result, x) === count(p, x))
  //@ ensures forall(x: string, forall(q: Place, x !== id ==> occurrences(at(\result, q), x) === occurrences(at(p, q), x)))
  const left = removed(p.left, id);
  const right = removed(p.right, id);
  const floating = removed(p.floating, id);
  const closed = removed(p.closed, id);
  const { place, index } = to;
  if (place === "left") return { left: inserted(left, index, id), right, floating, closed };
  if (place === "right") return { left, right: inserted(right, index, id), floating, closed };
  if (place === "floating") return { left, right, floating: inserted(floating, index, id), closed };
  return { left, right, floating, closed: inserted(closed, index, id) };
}

/**
 * The tab a side shows: `active` if it is still among `panels`, else the
 * first of them, or null when the side is empty.
 */
export function shownTab(active: string | null, panels: string[]): string | null {
  //@ verify
  //@ ensures panels.length === 0 <==> \result === null
  //@ ensures \result !== null ==> panels.includes(\result)
  //@ ensures active !== null && panels.includes(active) ==> \result === active
  if (active !== null && panels.includes(active)) return active;
  return panels.length > 0 ? panels[0]! : null;
}
