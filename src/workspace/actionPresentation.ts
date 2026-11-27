import { checkOf } from "../features/characters/moves";
import type { ActionDef, GameSystem } from "../systems/types";
import { IconPost, IconRoll, IconTarget } from "../ui/icons";

/** What an action rolls, as a short tag for its row: a stat, "any", or what it asks for. */
export function rollTag(system: GameSystem, action: ActionDef) {
  const check = checkOf(action);
  if (!check) return null;
  if (check.ask?.kind === "stat") return "any";
  if (check.ask?.kind === "number" || check.ask?.kind === "questions")
    return check.ask.label.toLowerCase();
  return system.stats.find((stat) => stat.id === check.stat)?.abbr ?? check.stat ?? null;
}

/** A signed number as the sheet shows it: +2, −1. */
export const signedStr = (value: number) => (value < 0 ? `−${-value}` : `+${value}`);

/** What using an action does first: pick targets, roll, or just post it. */
export function makeVerb(action: ActionDef) {
  return action.target
    ? { label: "Target", Icon: IconTarget }
    : checkOf(action)
      ? { label: "Roll", Icon: IconRoll }
      : { label: "Post", Icon: IconPost };
}
