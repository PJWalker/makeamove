import type { Campaign } from "../../campaign/campaign";
import { getSystem } from "../../systems";
import type { GameSystem } from "../../systems/types";
import { listHomebrew, withHomebrew } from "../homebrew/homebrew";

/** The campaign's system as published, without the table's homebrew: for the Libraries. */
export const baseSystemOf = (campaign: Campaign) => getSystem(campaign.systemId);

/** The merged system, rebuilt only when the system or homebrew changes. */
const merged = new WeakMap<Campaign, { base: GameSystem; version: number; system: GameSystem }>();
const versions = new WeakMap<Campaign, number>();

/** Count homebrew changes, so the merged system knows when to rebuild. */
function homebrewVersion(campaign: Campaign): number {
  let v = versions.get(campaign);
  if (v === undefined) {
    versions.set(campaign, (v = 0));
    campaign.homebrew.observe(() => versions.set(campaign, (versions.get(campaign) ?? 0) + 1));
  }
  return v;
}

/** The campaign's system, with the table's homebrew gear and moves. */
export function systemOf(campaign: Campaign): GameSystem {
  const base = baseSystemOf(campaign);
  const version = homebrewVersion(campaign);
  const known = merged.get(campaign);
  if (known && known.base === base && known.version === version) return known.system;
  const system = withHomebrew(base, listHomebrew(campaign.homebrew));
  merged.set(campaign, { base, version, system });
  return system;
}
