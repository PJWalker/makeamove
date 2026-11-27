import { newId } from "../lib/ids";
import type { NewElement, SceneElement } from "./types";

/*
 * Groups, one level deep: elements that share a `group` id are picked,
 * moved and restacked together. A group can be opened to pick its members
 * one at a time.
 */

/** The ids of the elements in a group. */
export const membersOf = (elements: readonly SceneElement[], group: string): string[] =>
  elements.flatMap((element) => (element.group === group ? [element.id] : []));

/**
 * `ids` with every other member of their groups added, in the order the
 * elements are drawn, except members of the group open for picking one by one.
 */
export function withGroups(
  elements: readonly SceneElement[],
  ids: readonly string[],
  open: string | null,
): string[] {
  const named = new Set(ids);
  const groups = new Set(
    elements.flatMap((element) =>
      named.has(element.id) && element.group && element.group !== open ? [element.group] : [],
    ),
  );
  if (groups.size === 0) return [...ids];
  const out = new Set(ids);
  for (const element of elements)
    if (element.group && groups.has(element.group)) out.add(element.id);
  return [...out];
}

/** Copies with groups of their own, so pasting or duplicating a group makes a new group. */
export function regroup<T extends Pick<NewElement, "group">>(copies: readonly T[]): T[] {
  const fresh = new Map<string, string>();
  return copies.map((copy) => {
    if (!copy.group) return copy;
    let group = fresh.get(copy.group);
    if (!group) {
      group = newId();
      fresh.set(copy.group, group);
    }
    return { ...copy, group };
  });
}
