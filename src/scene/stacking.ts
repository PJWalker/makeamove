import { generateNKeysBetween } from "fractional-indexing";
import { bounds } from "./geometry";
import type { Rect } from "./camera";
import { LAYERS } from "./types";
import type { Layer, SceneElement } from "./types";

/*
 * Stacking order. Elements are drawn layer by layer, and within a layer by
 * their fractional index `z`. Every rearrangement works out the order it
 * wants each layer in, then gives new indexes only to what it moved, so a
 * peer's concurrent edit to anything else is never touched.
 */

/**
 * Where to move elements: to the top or bottom of their layers, a step up
 * or down past the next thing they overlap, or into a layer at a place
 * among what's already there (on top, if no place is given).
 */
export type Arrangement =
  | { to: "back" | "backward" | "forward" | "front" }
  | { to: "layer"; layer: Layer; index?: number };

export type StackPatch = [string, { z: string; layer: Layer }];

/**
 * The new place of each element `ids` names, arranged `how`. `elements` are
 * the scene's, bottom to top. Elements that keep their place get no patch.
 */
export function arrange(
  elements: readonly SceneElement[],
  ids: Iterable<string>,
  how: Arrangement,
): StackPatch[] {
  const moved = new Set(ids);
  const layers = new Map<Layer, SceneElement[]>(LAYERS.map((l) => [l, []]));
  for (const element of elements) layers.get(element.layer)!.push(element);

  const orders = new Map<Layer, SceneElement[]>();
  if (how.to === "layer") {
    const moving = elements.filter((element) => moved.has(element.id));
    for (const [layer, list] of layers) {
      const kept = list.filter((element) => !moved.has(element.id));
      if (layer !== how.layer) {
        if (kept.length !== list.length) orders.set(layer, kept);
        continue;
      }
      const at = Math.max(0, Math.min(how.index ?? kept.length, kept.length));
      orders.set(layer, [...kept.slice(0, at), ...moving, ...kept.slice(at)]);
    }
  } else {
    for (const [layer, list] of layers)
      if (list.some((element) => moved.has(element.id)))
        orders.set(layer, reorder(list, moved, how.to));
  }

  const byId = new Map(elements.map((element) => [element.id, element]));
  const patches: StackPatch[] = [];
  for (const [layer, order] of orders) {
    for (const [id, z] of indexesFor(order, moved)) {
      const was = byId.get(id)!;
      if (was.z !== z || was.layer !== layer) patches.push([id, { z, layer }]);
    }
  }
  return patches;
}

/** One layer's elements, bottom to top, with the moved ones taken to the front or back, or a step either way. */
function reorder(
  list: readonly SceneElement[],
  moved: ReadonlySet<string>,
  to: "back" | "backward" | "forward" | "front",
): SceneElement[] {
  const isMoved = (element: SceneElement) => moved.has(element.id);
  const moving = list.filter((element) => isMoved(element));
  const kept = list.filter((element) => !isMoved(element));
  if (to === "front") return [...kept, ...moving];
  if (to === "back") return [...moving, ...kept];
  // A step: each moved element passes the nearest unmoved one it overlaps,
  // the topmost first going up and the bottommost first going down, so
  // the moved ones keep their order among themselves.
  const order = [...list];
  const up = to === "forward";
  const sequence = up ? [...moving].reverse() : moving;
  for (const element of sequence) {
    const from = order.indexOf(element);
    const box = bounds([element]);
    const step = up ? 1 : -1;
    let past = -1;
    for (let index = from + step; index >= 0 && index < order.length; index += step) {
      const other = order[index]!;
      if (!isMoved(other) && box && overlaps(box, bounds([other]))) {
        past = index;
        break;
      }
    }
    if (past === -1) continue;
    // Going up, taking it out shifts its target down one, so `past` is now just above it.
    order.splice(from, 1);
    order.splice(past, 0, element);
  }
  return order;
}

const overlaps = (a: Rect, b: Rect | null) =>
  b !== null && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** New indexes for the moved elements in `order`, between the unmoved ones either side of them. */
function indexesFor(
  order: readonly SceneElement[],
  moved: ReadonlySet<string>,
): Map<string, string> {
  const out = new Map<string, string>();
  let below: string | null = null;
  for (let index = 0; index < order.length;) {
    const element = order[index]!;
    if (!moved.has(element.id)) {
      below = element.z;
      index++;
      continue;
    }
    let end = index;
    while (end < order.length && moved.has(order[end]!.id)) end++;
    const above = order[end]?.z ?? null;
    // Two elements a peer gave the same index have no room between them; go just above.
    const keys = generateNKeysBetween(
      below,
      above !== null && below !== null && above <= below ? null : above,
      end - index,
    );
    for (const [n, key] of keys.entries()) out.set(order[index + n]!.id, key);
    below = keys.at(-1) ?? below;
    index = end;
  }
  return out;
}
