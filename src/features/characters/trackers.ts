import type { Campaign } from "../../campaign/campaign";
import type { GameSystem, TrackerDef } from "../../systems/types";
import { bumpData, bumpResource, canEdit, getCharacter, systemOf } from "./api";
import { derive } from "./store";
import type { CharacterView } from "./types";
import type { TrackerButton } from "../../core/richText";

/*
 * Inline buttons in text that add to or spend a character's numbers:
 * [[+1 XP]] shows a "+1 XP" button; [[-1 Treasure|Spend 1 Treasure]] shows
 * its own label. Which numbers can be named is the system's (its trackers,
 * or failing those its resources).
 */

export function trackersOf(system: GameSystem): TrackerDef[] {
  return (
    system.trackers ??
    system.resources.map((r) => ({ id: r.id, name: r.name, resource: r.id, max: r.max }))
  );
}

export function findTracker(system: GameSystem, name: string): TrackerDef | undefined {
  const n = name.trim().toLowerCase();
  return trackersOf(system).find((t) =>
    [t.id, t.name, ...(t.aliases ?? [])].some((x) => x.toLowerCase() === n),
  );
}

function maxOf(system: GameSystem, c: CharacterView, t: TrackerDef): number | undefined {
  if (t.max === undefined) return undefined;
  return typeof t.max === "number" ? t.max : derive(c, system).values[t.max];
}

const valueOf = (c: CharacterView, t: TrackerDef) =>
  Number((t.resource ? c.resources[t.resource] : c.data[t.data ?? ""]) ?? 0);

/** Why a button can't be pressed for this character, or null if it can. */
export function trackerBlock(
  campaign: Campaign,
  characterId: string | null | undefined,
  b: TrackerButton,
): string | null {
  const system = systemOf(campaign);
  const t = findTracker(system, b.name);
  if (!t) return `${b.name} isn't something this game tracks`;
  const c = characterId ? getCharacter(campaign, characterId) : undefined;
  if (!c) return "Choose a character first";
  if (!canEdit(campaign, c)) return `${c.name} isn't yours to change`;
  const value = valueOf(c, t);
  if (b.by < 0 && value + b.by < 0) return `${c.name} has only ${value} ${t.name}`;
  const max = maxOf(system, c, t);
  if (b.by > 0 && max !== undefined && value >= max) return `${c.name}'s ${t.name} is full`;
  return null;
}

/** Press a button: add its amount to the character's number, within its bounds. */
export function pressTracker(campaign: Campaign, characterId: string, b: TrackerButton): boolean {
  if (trackerBlock(campaign, characterId, b)) return false;
  const system = systemOf(campaign);
  const t = findTracker(system, b.name)!;
  const c = getCharacter(campaign, characterId)!;
  const max = maxOf(system, c, t);
  if (t.resource) bumpResource(campaign, c.id, t.resource, b.by, max);
  else if (t.data) bumpData(campaign, c.id, t.data, b.by, max);
  return true;
}
