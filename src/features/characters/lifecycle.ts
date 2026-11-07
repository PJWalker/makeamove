import * as Y from "yjs";
import type { Campaign } from "../../campaign/campaign";
import { newId } from "../../lib/ids";
import { device } from "../../platform/device";
import type { DataValue } from "../../core/types";
import type { TemplateSettings } from "./types";
import { setNpcField } from "./sheet";
import { createCharacter } from "./store";
import { systemOf } from "./system";

/*
 * Making, copying, choosing and deleting characters.
 */

/**
 * A new copy of a template, for one of its tokens: it has only a name, and
 * takes everything else from the template until it's changed on the copy.
 */
export function createCopy(campaign: Campaign, templateId: string, name: string): string {
  const id = newId();
  const m = new Y.Map<any>();
  campaign.doc.transact(() => {
    campaign.characters.set(id, m);
    m.set("base", templateId);
    m.set("name", name);
  });
  return id;
}

/** Undo everything changed on a copy but its name, so it's the template again. */
export function resetCopy(campaign: Campaign, id: string) {
  const m = campaign.characters.get(id);
  if (!m?.get("base")) return;
  campaign.doc.transact(() => {
    for (const key of [...m.keys()]) if (key !== "base" && key !== "name") m.delete(key);
  });
}

/** Make a character a template (its tokens keep their own state), or an individual again with null. */
export function setTemplate(campaign: Campaign, id: string, settings: TemplateSettings | null) {
  const m = campaign.characters.get(id);
  if (!m) return;
  if (settings) m.set("template", settings);
  else m.delete("template");
}

export function selectCharacter(campaign: Campaign, id: string | undefined) {
  const m = campaign.members.get(device.value.id);
  if (!m) return;
  if (id) m.set("character", id);
  else m.delete("character");
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
  selectCharacter(campaign, id);
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
  selectCharacter(campaign, id);
  return id;
}

/** Copy a system monster into a new NPC character. */
export function newNpcFromMonster(campaign: Campaign, monsterId: string) {
  const system = systemOf(campaign);
  const monster = system.monsters?.find((entry) => entry.id === monsterId);
  if (!monster) return undefined;
  const id = newNpc(campaign, monster.name);
  const character = campaign.characters.get(id)!;
  if (monster.scores) {
    const scores = character.get("scores") as Y.Map<number>;
    for (const [stat, value] of Object.entries(monster.scores))
      if (system.stats.some((entry) => entry.id === stat)) scores.set(stat, value);
  }
  const hp = system.resources.find((resource) => resource.id === "hp");
  if (hp) (character.get("resources") as Y.Map<number>).set(hp.id, monster.hp);
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
    for (const m of campaign.members.values()) if (m.get("character") === id) m.delete("character");
    for (const [copy, m] of [...campaign.characters.entries()])
      if (m.get("base") === id) campaign.characters.delete(copy);
    campaign.characters.delete(id);
  });
}
