import { generateNKeysBetween } from "fractional-indexing";
import { bounds, intersects } from "./geometry";
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
 * or down past the next thing they overlap, into a layer at a place among
 * what's already there (on top, if no place is given), or together, just
 * under the topmost of them, in its layer.
 */
export type Arrangement =
  | Restack
  | { to: "layer"; layer: Layer; index?: number }
  | { to: "together" };
/** Moves within the layers elements are already in. */
interface Restack {
  to: "back" | "backward" | "forward" | "front";
}

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
  const into = how.to === "together" ? together(layers, moved) : how;
  if (into?.to === "layer") {
    const moving = elements.filter((element) => moved.has(element.id));
    for (const [layer, list] of layers) {
      const kept = list.filter((element) => !moved.has(element.id));
      if (layer !== into.layer) {
        if (kept.length !== list.length) orders.set(layer, kept);
        continue;
      }
      const at = Math.max(0, Math.min(into.index ?? kept.length, kept.length));
      orders.set(layer, [...kept.slice(0, at), ...moving, ...kept.slice(at)]);
    }
  } else if (into) {
    for (const [layer, list] of layers)
      if (list.some((element) => moved.has(element.id)))
        orders.set(layer, reorder(list, moved, into.to));
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

/** Where gathering elements together puts them: in the layer of the topmost, just under it. */
function together(
  layers: ReadonlyMap<Layer, readonly SceneElement[]>,
  moved: ReadonlySet<string>,
): { to: "layer"; layer: Layer; index: number } | null {
  for (const layer of [...LAYERS].reverse()) {
    const list = layers.get(layer)!;
    const top = list.findLastIndex((element) => moved.has(element.id));
    if (top === -1) continue;
    const below = list.slice(0, top).filter((element) => !moved.has(element.id)).length;
    return { to: "layer", layer, index: below };
  }
  return null;
}

/** One layer's elements, bottom to top, with the moved ones taken to the front or back, or a step either way. */
function reorder(
  list: readonly SceneElement[],
  moved: ReadonlySet<string>,
  to: Restack["to"],
): SceneElement[] {
  const moving = list.filter((element) => moved.has(element.id));
  const kept = list.filter((element) => !moved.has(element.id));
  if (to === "front") return [...kept, ...moving];
  if (to === "back") return [...moving, ...kept];
  return step(list, moved, to === "forward");
}

/**
 * A step: each group moved (or element, if it's in none) passes the
 * nearest unmoved element it overlaps, and its members end up together.
 * The topmost goes first going up, and the bottommost going down, so what
 * moved keeps its order.
 */
function step(
  list: readonly SceneElement[],
  moved: ReadonlySet<string>,
  up: boolean,
): SceneElement[] {
  const units = new Map<string, SceneElement[]>();
  for (const element of list) {
    if (!moved.has(element.id)) continue;
    const key = element.group ?? element.id;
    units.set(key, [...(units.get(key) ?? []), element]);
  }
  let order = [...list];
  const sequence = up ? [...units.values()].reverse() : [...units.values()];
  for (const unit of sequence) {
    const box = bounds(unit);
    const edge = order.indexOf((up ? unit.at(-1) : unit[0])!);
    const direction = up ? 1 : -1;
    let target: SceneElement | null = null;
    for (let index = edge + direction; index >= 0 && index < order.length; index += direction) {
      const other = order[index]!;
      const otherBox = bounds([other]);
      if (!moved.has(other.id) && box && otherBox && intersects(box, otherBox)) {
        target = other;
        break;
      }
    }
    if (!target) continue;
    order = order.filter((element) => !unit.includes(element));
    order.splice(order.indexOf(target) + (up ? 1 : 0), 0, ...unit);
  }
  return order;
}

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
