/*
 * What a move costs: the resource changes it makes, merged so each resource
 * appears once, and whether a character can afford them.
 */

/** A change to one resource, as actions, variants and roll bonuses declare it. */
export interface Cost {
  resource: string;
  by: number;
}

/** The net change a move makes to one resource. */
export interface Spend {
  id: string;
  by: number;
}

/** The net change `costs` make to `resource`. */
export function totalFor(costs: Cost[], resource: string): number {
  //@ verify
  //@ decreases costs.length
  if (costs.length === 0) return 0;
  // LemmaScript doesn't model `.at()`.
  // eslint-disable-next-line unicorn/prefer-at
  const last = costs[costs.length - 1]!;
  return totalFor(costs.slice(0, -1), resource) + (last.resource === resource ? last.by : 0);
}

/**
 * Merge costs into one net change per resource, leaving out resources whose
 * changes cancel out.
 */
export function mergeCosts(costs: Cost[]): Spend[] {
  //@ verify
  //@ ensures forall(i, 0 <= i && i < \result.length ==> \result[i].by !== 0)
  //@ ensures forall(i, 0 <= i && i < \result.length ==> \result[i].by === totalFor(costs, \result[i].id))
  //@ ensures forall(i, forall(j, 0 <= i && i < j && j < \result.length ==> \result[i].id !== \result[j].id))
  //@ ensures forall(r: string, totalFor(costs, r) !== 0 ==> exists(j, 0 <= j && j < \result.length && \result[j].id === r))
  let totals: Spend[] = [];
  let i = 0;
  while (i < costs.length) {
    //@ invariant 0 <= i && i <= costs.length
    //@ invariant forall(k, 0 <= k && k < totals.length ==> totals[k].by === totalFor(costs.slice(0, i), totals[k].id))
    //@ invariant forall(k, forall(j, 0 <= k && k < j && j < totals.length ==> totals[k].id !== totals[j].id))
    //@ invariant forall(r: string, totalFor(costs.slice(0, i), r) !== 0 ==> exists(j, 0 <= j && j < totals.length && totals[j].id === r))
    //@ decreases costs.length - i
    const cost = costs[i]!;
    const at = totals.findIndex((t) => t.id === cost.resource);
    totals =
      at === -1
        ? [...totals, { id: cost.resource, by: cost.by }]
        : totals.with(at, { id: cost.resource, by: totals[at]!.by + cost.by });
    i++;
  }
  let merged: Spend[] = [];
  let k = 0;
  while (k < totals.length) {
    //@ invariant 0 <= k && k <= totals.length
    //@ invariant forall(m, 0 <= m && m < merged.length ==> merged[m].by !== 0)
    //@ invariant forall(m, 0 <= m && m < merged.length ==> merged[m].by === totalFor(costs, merged[m].id))
    //@ invariant forall(m, forall(j, 0 <= m && m < j && j < merged.length ==> merged[m].id !== merged[j].id))
    //@ invariant forall(m, forall(j, 0 <= m && m < merged.length && k <= j && j < totals.length ==> merged[m].id !== totals[j].id))
    //@ invariant forall(j, 0 <= j && j < k && totals[j].by !== 0 ==> exists(m, 0 <= m && m < merged.length && merged[m].id === totals[j].id))
    //@ decreases totals.length - k
    const total = totals[k]!;
    if (total.by !== 0) merged = [...merged, total];
    k++;
  }
  return merged;
}

/** How much of resource `id` a character holds: none if it isn't listed. */
export function held(resources: Record<string, number>, id: string): number {
  //@ verify
  return resources[id] ?? 0;
}

/** Whether a character with `resources` can make every change in `spends` without going below zero. */
export function canAfford(resources: Record<string, number>, spends: Spend[]): boolean {
  //@ verify
  //@ ensures \result <==> forall(i, 0 <= i && i < spends.length ==> held(resources, spends[i].id) + spends[i].by >= 0)
  return spends.every((s) => held(resources, s.id) + s.by >= 0);
}
