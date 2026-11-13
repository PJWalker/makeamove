import type { Campaign } from "../../campaign/campaign";
import { newId } from "../../lib/ids";
import { device } from "../../platform/device";
import type { DataValue } from "../../data/types";
import type { TemplateSettings } from "./types";
import { setNpcField, setResource, setScore } from "./sheet";
import { createCharacter } from "./store";
import { systemOf } from "./system";
import { canClaim, getCharacter, playedCharacterId } from "./queries";

/*
 * Making, copying, choosing and deleting characters.
 */

/**
 * A new copy of a template, for one of its tokens: it has only a name, and
 * takes everything else from the template until it's changed on the copy.
 */
export function createCopy(campaign: Campaign, templateId: string, name: string): string {
  const id = newId();
  campaign.characters.set(id, { base: templateId, name });
  return id;
}

/** Undo everything changed on a copy but its name, so it's the template again. */
export function resetCopy(campaign: Campaign, id: string) {
  const m = campaign.characters.get(id);
  if (!m?.get("base")) return;
  m.transact(() => {
    for (const key of m.keys()) if (key !== "base" && key !== "name") m.delete(key);
  });
}

/** Make a character a template (its tokens keep their own state), or an individual again with null. */
export function setTemplate(campaign: Campaign, id: string, settings: TemplateSettings | null) {
  const m = campaign.characters.get(id);
  m?.patch({ template: settings ?? undefined });
}

/** Open a character's sheet in the Characters panel, or none with undefined. */
export function viewCharacter(campaign: Campaign, id: string | undefined) {
  campaign.members.get(device.value.id)?.patch({ character: id });
}

/**
 * Claim a character as this device's player character, making it theirs to
 * edit. A member plays one character at a time, and a character has one player.
 */
export function claimCharacter(campaign: Campaign, id: string) {
  const m = campaign.members.get(device.value.id);
  const c = getCharacter(campaign, id);
  if (!m || !c || !canClaim(campaign, c)) return;
  campaign.doc.transact(() => {
    m.set("playing", id);
    campaign.characters.get(id)!.set("owner", device.value.id);
  });
}

/** Stop playing a character; it stays this device's to edit. */
export function releaseCharacter(campaign: Campaign) {
  campaign.members.get(device.value.id)?.delete("playing");
}

/** A new player character, with the scores and data the guided creation flow worked out, if any. */
export function newCharacter(
  campaign: Campaign,
  name: string,
  classId: string,
  made?: { scores: Record<string, number>; data: Record<string, DataValue> },
) {
  const id = createCharacter(campaign.characters, systemOf(campaign), {
    name: name.trim() || "Unnamed",
    owner: device.value.id,
    ...(made ? { scores: made.scores } : {}),
    data: { classId, ...made?.data },
  });
  viewCharacter(campaign, id);
  // A player's first character is the one they play; the GM's are pregenerated.
  if (!campaign.isGm() && !playedCharacterId(campaign)) claimCharacter(campaign, id);
  return id;
}

/** A non-player character, with the folder it starts in. */
export function newNpc(campaign: Campaign, name: string, folder?: string) {
  const id = createCharacter(campaign.characters, systemOf(campaign), {
    name: name.trim() || "Unnamed NPC",
    owner: device.value.id,
    kind: "npc",
    ...(folder ? { folder } : {}),
  });
  viewCharacter(campaign, id);
  return id;
}

/** Copy a system monster into a new NPC character. */
export function newNpcFromMonster(campaign: Campaign, monsterId: string) {
  const system = systemOf(campaign);
  const monster = system.monsters?.find((entry) => entry.id === monsterId);
  if (!monster) return undefined;
  const id = newNpc(campaign, monster.name);
  for (const [stat, value] of Object.entries(monster.scores ?? {}))
    if (system.stats.some((entry) => entry.id === stat)) setScore(campaign, id, stat, value);
  const hp = system.resources.find((resource) => resource.id === "hp");
  if (hp) setResource(campaign, id, hp.id, monster.hp);
  for (const [field, value] of Object.entries(monster.fields))
    if (system.npcFields.some((entry) => entry.id === field))
      setNpcField(campaign, id, field, value);
  if (monster.size && system.npcFields.some((field) => field.id === "size"))
    setNpcField(campaign, id, "size", monster.size);
  return id;
}

/** Delete a character (and a template's copies), and stop anyone playing it from pointing at it. */
export function deleteCharacter(campaign: Campaign, id: string) {
  campaign.doc.transact(() => {
    for (const m of campaign.members.values()) {
      if (m.get("character") === id) m.delete("character");
      if (m.get("playing") === id) m.delete("playing");
    }
    for (const [copy, m] of campaign.characters.entries())
      if (m.get("base") === id) campaign.characters.delete(copy);
    campaign.characters.delete(id);
  });
}
