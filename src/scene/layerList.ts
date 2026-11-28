import type { Arrangement } from "./stacking";
import { EFFECTS, LAYERS, SHAPES } from "./types";
import type { Layer, SceneElement } from "./types";

/*
 * The list of what's on a scene, as the Layers panel shows it: each layer
 * from the top down, and in each, its elements from the top down, a group
 * as one row where its topmost member is.
 */

export const LAYER_LABELS: Record<Layer, string> = {
  aboveFog: "Over Fog",
  over: "Over Tokens",
  token: "Tokens",
  under: "Under Tokens",
  map: "Maps",
};

export type LayerRow =
  | { kind: "element"; element: SceneElement }
  | { kind: "group"; group: string; members: SceneElement[] };

export interface LayerSection {
  layer: Layer;
  rows: LayerRow[];
}

/** The ids a row stands for: its element, or its group's members. */
export const rowIds = (row: LayerRow): string[] =>
  row.kind === "element" ? [row.element.id] : row.members.map((element) => element.id);

/** `elements` (bottom to top) as the list shows them: layers and rows top down. */
export function layerList(elements: readonly SceneElement[]): LayerSection[] {
  return [...LAYERS].reverse().map((layer) => {
    const rows: LayerRow[] = [];
    const groups = new Map<string, SceneElement[]>();
    for (const element of [...elements].reverse()) {
      if (element.layer !== layer) continue;
      if (!element.group) {
        rows.push({ kind: "element", element });
        continue;
      }
      const members = groups.get(element.group);
      if (members) {
        members.push(element);
        continue;
      }
      const group = { kind: "group" as const, group: element.group, members: [element] };
      groups.set(element.group, group.members);
      rows.push(group);
    }
    return { layer, rows };
  });
}

const SIMPLE_LABELS: Partial<Record<SceneElement["type"], string>> = {
  token: "Token",
  map: "Map",
  drawing: "Drawing",
  light: "Lamp",
  pin: "Pin",
};

/** What an element is called in the list: its name, or else what it is. */
export function elementLabel(element: SceneElement): string {
  if (element.name) return element.name;
  const simple = SIMPLE_LABELS[element.type];
  if (simple) return simple;
  switch (element.type) {
    case "shape": {
      return SHAPES.find((s) => s.id === element.shape)?.label ?? "Shape";
    }
    case "text": {
      const first = element.text.split("\n")[0] ?? "";
      return first === "" ? "Text" : first;
    }
    case "wall": {
      return element.door ? "Door" : "Wall";
    }
    case "area": {
      return element.tone === "dark" ? "Area of Dark" : "Area of Light";
    }
    case "fog": {
      return element.force === "reveal" ? "Revealed Fog" : "Hidden Fog";
    }
    case "effect": {
      return EFFECTS.find((e) => e.id === element.effect)?.label ?? "Effect";
    }
    default: {
      return element.type;
    }
  }
}

/**
 * Where a row dropped in the list lands: in a layer, just under the
 * elements `under` names (a row's ids), just over the element `over` names
 * (the top member of an open group, dropped under its heading), or else at
 * the top of the layer.
 */
export interface DropSpot {
  layer: Layer;
  under?: readonly string[];
  over?: string;
}

/** How to arrange what's dropped at `spot`: `moving` is what the dragged row stands for. */
export function dropArrangement(
  elements: readonly SceneElement[],
  moving: ReadonlySet<string>,
  { layer, under, over }: DropSpot,
): Arrangement {
  const kept = elements.filter((element) => element.layer === layer && !moving.has(element.id));
  if (over !== undefined) {
    const at = kept.findIndex((element) => element.id === over);
    if (at !== -1) return { to: "layer", layer, index: at + 1 };
  }
  const target = new Set(under);
  const lowest = kept.findIndex((element) => target.has(element.id));
  return { to: "layer", layer, index: lowest === -1 ? kept.length : lowest };
}
