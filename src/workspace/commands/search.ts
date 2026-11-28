import Fuse from "fuse.js";
import type { Action } from "./types";

const fuseOptions = {
  keys: [
    { name: "title", weight: 0.7 },
    { name: "aliases", weight: 0.2 },
    { name: "tags", weight: 0.1 },
  ],
  includeScore: true,
  ignoreDiacritics: true,
  ignoreLocation: true,
  useTokenSearch: true,
  tokenMatch: "all" as const,
};

/** Score an action against a query; 0 means it doesn't match. */
export function scoreAction(a: Action, query: string): number {
  if (!query.trim()) return 1;
  const result = new Fuse([a], fuseOptions).search(query)[0];
  return result ? 100 * (1 - (result.score ?? 1)) : 0;
}

export interface RankOptions {
  /** Most recent first. */
  recent?: string[];
  limit?: number;
  /** With nothing typed, list every action after the recent and the selected character's ones. */
  everything?: boolean;
}

/** What recent actions remember a call by: its verb, for one made from a sentence. */
const recentKey = (a: Action) => a.verb ?? a.id;

export function rank(
  actions: Action[],
  input: string,
  { recent = [], limit = 40, everything = false }: RankOptions = {},
): Action[] {
  const typed = input.trim();

  if (!typed) {
    // Nothing typed: recent actions, then the selected character's moves, then (if asked) the rest.
    const fromRecent = recent.flatMap((key) => actions.filter((a) => recentKey(a) === key));
    const remembered = new Set(recent);
    const rest = actions.filter((a) => !remembered.has(recentKey(a)));
    const mine = rest.filter((a) => a.mine);
    const others = everything ? rest.filter((a) => !a.mine) : [];
    return [...fromRecent, ...mine, ...others].slice(0, limit);
  }

  const registrationOrder = new Map(actions.map((action, index) => [action, index]));
  const scored = new Fuse(actions, fuseOptions).search(typed).map(({ item: a, score }) => {
    let s = 100 * (1 - (score ?? 0));
    if (a.mine) s += 15;
    const r = recent.indexOf(recentKey(a));
    if (r !== -1) s += Math.max(2, 12 - r);
    if (a.available !== true) s -= 30;
    return { a, s, i: registrationOrder.get(a) ?? 0 };
  });
  // Stable: equal scores keep the order they were registered in.
  scored.sort((x, y) => y.s - x.s || x.i - y.i);
  return scored.slice(0, limit).map((x) => x.a);
}
