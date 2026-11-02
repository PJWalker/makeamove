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
}

export function rank(
  actions: Action[],
  input: string,
  { recent = [], limit = 40 }: RankOptions = {},
): Action[] {
  const typed = input.trim();

  if (!typed) {
    // Nothing typed: recent actions, then the selected character's moves.
    const byId = new Map(actions.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const out: Action[] = [];
    for (const id of recent) {
      const a = byId.get(id);
      if (a && !seen.has(id)) {
        seen.add(id);
        out.push(a);
      }
    }
    for (const a of actions) if (a.mine && !seen.has(a.id)) out.push(a);
    return out.slice(0, limit);
  }

  const matches = typed
    ? new Fuse(actions, fuseOptions).search(typed)
    : actions.map((item) => ({ item, score: 0 }));
  const registrationOrder = new Map(
    actions.map((action, index) => [action, index]),
  );
  const scored: { a: Action; s: number; i: number }[] = [];
  matches.forEach(({ item: a, score }) => {
    const base = 100 * (1 - (score ?? 0));
    let s = base;
    if (a.mine) s += 15;
    const r = recent.indexOf(a.id);
    if (r >= 0) s += Math.max(2, 12 - r);
    if (a.available !== true) s -= 30;
    scored.push({ a, s, i: registrationOrder.get(a) ?? 0 });
  });
  // Stable: equal scores keep the order they were registered in.
  scored.sort((x, y) => y.s - x.s || x.i - y.i);
  return scored.slice(0, limit).map((x) => x.a);
}
