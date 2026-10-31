import type { EntityGraphic } from "../graphics";
import { entityGraphicKey } from "../graphics";
import { getCharacter, systemOf } from "../characters/api";
import type { Campaign } from "../store/campaign";

const DEFAULT_ICON: Record<string, string> = {
  character: "character",
  item: "bag",
  move: "move",
  note: "note",
  scene: "map",
  class: "hero",
  tag: "tag",
  option: "books",
};

export function getEntityGraphic(
  campaign: Campaign,
  kind: string,
  id: string,
  defaultIcon?: string,
): EntityGraphic {
  const custom = campaign.entityGraphics.get(entityGraphicKey(kind, id));
  if (custom) return custom;
  return getDefaultEntityGraphic(campaign, kind, id, defaultIcon);
}

export function getDefaultEntityGraphic(
  campaign: Campaign,
  kind: string,
  id: string,
  defaultIcon?: string,
): EntityGraphic {
  const system = systemOf(campaign);
  let name = defaultIcon ?? DEFAULT_ICON[kind] ?? "bag";
  if (kind === "character") {
    const character = getCharacter(campaign, id);
    if (character?.base) {
      const inherited = campaign.entityGraphics.get(
        entityGraphicKey(kind, character.base),
      );
      if (inherited) return inherited;
    }
    name =
      system.classes.find((cls) => cls.id === character?.classId)?.icon ?? name;
  } else if (kind === "item") {
    name = system.items.find((item) => item.id === id)?.icon ?? name;
  } else if (kind === "move") {
    const move = system.actions.find((action) => action.id === id);
    if (move) name = move.category === "class" ? "class-move" : "move";
  } else if (kind === "class") {
    name = system.classes.find((cls) => cls.id === id)?.icon ?? name;
  }
  return { kind: "icon", name };
}

export function setEntityGraphic(
  campaign: Campaign,
  kind: string,
  id: string,
  graphic?: EntityGraphic,
) {
  const key = entityGraphicKey(kind, id);
  if (graphic) campaign.entityGraphics.set(key, graphic);
  else campaign.entityGraphics.delete(key);
}
