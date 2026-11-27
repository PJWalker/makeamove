import { newId } from "../../lib/ids";
import type { Duration } from "../characters/types";
import type { Combatant, CombatMaps } from "./schema";
import { passedOn, stepBack, stepForward } from "./turns";

export type { Combatant, CombatMaps } from "./schema";

/*
 * The turn tracker (design: core change 11). One fight at a time per
 * campaign, in two parts of the campaign root (schema.ts): `combat`,
 * the round and whose turn it is, and `combatants`, who's in the fight.
 *
 * Moving the turn on is where time passes: the combatant whose turn ends
 * counts down durations ticked at the end of their turn, the one whose turn
 * starts counts down those ticked at the start and refills resources that
 * reset each turn. These are pure functions over the maps, so the rules can
 * be tested without the app; combat/api.ts wires them to characters.
 */

export interface CombatantView extends Combatant {
  id: string;
}

/** Initiative order: highest first, ties by `tie`, then by name; unrolled at the end. */
export function turnOrder(combatants: CombatMaps["combatants"]): CombatantView[] {
  return combatants
    .entries()
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => {
      if (a.init === null && b.init === null) return a.name.localeCompare(b.name);
      if (a.init === null) return 1;
      if (b.init === null) return -1;
      return b.init - a.init || b.tie - a.tie || a.name.localeCompare(b.name);
    });
}

export const roundOf = (m: CombatMaps): number => m.combat.get("round");
export const turnOf = (m: CombatMaps): string | null => m.combat.get("turn") ?? null;

export function addCombatant(m: CombatMaps, c: Combatant): string {
  const id = newId();
  m.combatants.set(id, c);
  return id;
}

export function updateCombatant(m: CombatMaps, id: string, patch: Partial<Combatant>) {
  const c = m.combatants.get(id);
  if (c) m.combatants.set(id, { ...c, ...patch });
}

/** Remove a combatant; if it was their turn, the turn passes to the next. */
export function removeCombatant(m: CombatMaps, id: string) {
  m.combatants.transact(() => {
    if (turnOf(m) === id) {
      const order = turnOrder(m.combatants);
      const next = passedOn(
        order.length,
        order.findIndex((c) => c.id === id),
      );
      m.combat.patch({ turn: order[next]?.id });
    }
    m.combatants.delete(id);
  });
}

/** What happens when the turn moves: whose turn ended and whose began, and whether a new round started. */
export interface TurnChange {
  ended: string | null;
  started: string | null;
  newRound: boolean;
}

/** Start the fight at round 1, with the first in initiative order. */
export function startCombat(m: CombatMaps): TurnChange {
  const first = turnOrder(m.combatants)[0]?.id ?? null;
  m.combatants.transact(() => {
    m.combat.patch({ round: 1, turn: first ?? undefined });
  });
  return { ended: null, started: first, newRound: true };
}

/** Pass the turn to the next combatant, starting a new round after the last. */
export function nextTurn(m: CombatMaps): TurnChange {
  const order = turnOrder(m.combatants);
  if (order.length === 0) return { ended: null, started: null, newRound: false };
  const now = turnOf(m);
  const index = order.findIndex((c) => c.id === now);
  const step = stepForward(order.length, { index, round: roundOf(m) });
  const next = order[step.index]!;
  const newRound = step.round !== roundOf(m);
  m.combatants.transact(() => {
    m.combat.set("round", step.round);
    m.combat.set("turn", next.id);
  });
  return { ended: now, started: next.id, newRound };
}

/** Step back a turn, for mistakes. Durations aren't wound back. */
export function previousTurn(m: CombatMaps) {
  const order = turnOrder(m.combatants);
  if (order.length === 0) return;
  const at = { index: order.findIndex((c) => c.id === turnOf(m)), round: roundOf(m) };
  const step = stepBack(order.length, at);
  if (step === at) return;
  m.combatants.transact(() => {
    m.combat.set("round", step.round);
    m.combat.set("turn", order[step.index]!.id);
  });
}

/** End the fight: everyone leaves the tracker. */
export function endCombat(m: CombatMaps) {
  m.combatants.transact(() => {
    m.combat.patch({ round: 0, turn: undefined });
    m.combatants.clear();
  });
}

/**
 * Count down the durations that tick at this point of this combatant's turn.
 * Returns the durations left and the conditions that ran out.
 */
export function tickDurations(
  durations: Record<string, Duration>,
  combatant: string,
  tick: "end" | "start",
): { left: Record<string, Duration>; expired: string[] } {
  const left: Record<string, Duration> = {};
  const expired: string[] = [];
  for (const [condition, d] of Object.entries(durations)) {
    if (d.of !== combatant || d.tick !== tick) left[condition] = d;
    else if (d.rounds > 1) left[condition] = { ...d, rounds: d.rounds - 1 };
    else expired.push(condition);
  }
  return { left, expired };
}
