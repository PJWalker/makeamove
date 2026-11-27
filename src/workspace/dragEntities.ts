import type { Campaign } from "../campaign/campaign";
import { actingCharacterId, canEdit, getCharacter, systemOf } from "../features/characters/api";
import { librarySlot, moveSlot } from "../features/characters/hotbar";
import type { LinkKind } from "../features/notes/links";
import { linkLabel } from "../features/notes/targets";
import { callKey } from "../kernel/commands";
import type { EntityGraphic } from "../media/images";
import type { TokenElement } from "../scene/types";
import type { ItemDef } from "../systems/types";
import type { CampaignContext } from "./campaignContext";
import { pinToHotbar } from "./commands/campaign";
import {
  addItem,
  equipItem,
  giveItem,
  openCharacter,
  setLearned,
  startMove,
  useItem,
} from "./commands/characters";
import { openScene } from "./commands/scenes";
import type { DragEntity } from "./entityDrag";
import { getEntityGraphic } from "./entityGraphics";

/*
 * What the campaign's things drag as (entityDrag.ts moves them): a link to
 * them, a hotbar pin, a gift to a character, a token for the map.
 */

/** The call that pins a link target to the hotbar, for the targets that have one. */
function pinnedCall(kind: LinkKind, id: string): string | undefined {
  switch (kind) {
    case "move": {
      return moveSlot(id);
    }
    case "item": {
      return librarySlot(id);
    }
    case "character": {
      return callKey(openCharacter.id, { id });
    }
    case "scene": {
      return callKey(openScene.id, { id });
    }
    default: {
      return undefined;
    }
  }
}

const pinAt = (context: CampaignContext, key: string) => (index: number) =>
  void context.execute(pinToHotbar, { key, at: index });

const canGive = (context: CampaignContext, characterId: string) => {
  const character = getCharacter(context.campaign, characterId);
  return !!character && canEdit(context.campaign, character);
};

/** How a token looks, to carry over to the token it's dragged as. */
const tokenLook = (token: TokenElement) => ({
  ...(token.image ? { image: token.image } : {}),
  ...(token.style ? { style: token.style } : {}),
  ...(token.colour ? { colour: token.colour } : {}),
});

/** An entity for a link target: anything links; most also pin; gear and moves can be given. */
export function entity(
  context: CampaignContext,
  kind: LinkKind,
  id: string,
  label: string,
  equipOnGive = false,
): DragEntity {
  const { campaign } = context;
  const key = pinnedCall(kind, id);
  const out: DragEntity = {
    label,
    token: { name: label },
    link: { kind, id },
    ...(key ? { pin: pinAt(context, key) } : {}),
  };
  if (kind === "character") {
    const character = getCharacter(campaign, id);
    if (character)
      out.token = {
        characterId: id,
        name: character.name,
        graphic: getEntityGraphic(campaign, "character", id),
        entityRef: { kind: "character", id },
        ...(character.tokenStyle ? { style: character.tokenStyle } : {}),
        ...(character.tokenColour ? { colour: character.tokenColour } : {}),
      };
  }
  if (kind === "item") {
    const def = systemOf(campaign).items.find((index) => index.id === id);
    out.token = { name: label, icon: def?.icon ?? "bag", itemDefId: id };
    if (def)
      out.give = {
        kind,
        to: (characterId) =>
          void context.execute(giveItem, { characterId, item: def, equip: equipOnGive }),
        canGive: (characterId) => canGive(context, characterId),
      };
  }
  if (kind === "move") {
    out.token = { name: label, icon: "move" };
    out.give = {
      kind,
      to: (characterId) =>
        void context.execute(setLearned, { id: characterId, action: id, known: true }),
      canGive: (characterId) => canGive(context, characterId),
    };
  }
  return out;
}

/** A scene item token as a draggable inventory item or text link. */
export function itemDefinitionForToken(
  campaign: Campaign,
  token: TokenElement,
): ItemDef | undefined {
  const {items} = systemOf(campaign);
  if (token.itemDefId) return items.find((item) => item.id === token.itemDefId);
  if (!token.icon) return undefined;
  const matches = items.filter(
    (item) => item.name === token.name && (item.icon ?? "bag") === token.icon,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function itemTokenEntity(context: CampaignContext, token: TokenElement): DragEntity | null {
  const def = itemDefinitionForToken(context.campaign, token);
  if (!def) return null;
  const dragged = entity(context, "item", def.id, token.name, true);
  dragged.token = {
    itemDefId: def.id,
    name: token.name,
    icon: token.icon ?? def.icon ?? "bag",
    ...tokenLook(token),
  };
  return dragged;
}

/** The link target a call names, for the calls that name one. */
function linkTargetOf(
  command: unknown,
  parameters: { id?: string; move?: string; item?: string },
): [LinkKind, string | undefined] | null {
  switch (command) {
    case startMove: {
      return ["move", parameters.move];
    }
    case addItem: {
      return ["item", parameters.item];
    }
    case openCharacter: {
      return ["character", parameters.id];
    }
    case openScene: {
      return ["scene", parameters.id];
    }
    default: {
      return null;
    }
  }
}

/** An entity for a hotbar or palette call, by its key: links and gifts where it names a link target. */
export function actionEntity(context: CampaignContext, key: string, label: string): DragEntity {
  const pin = pinAt(context, key);
  const call = context.commands.resolve(key);
  const parameters = (call?.params ?? {}) as {
    id?: string;
    move?: string;
    item?: string;
    itemId?: string;
  };
  const command = call?.command;
  if ((command === useItem || command === equipItem) && parameters.itemId) {
    const item = getCharacter(context.campaign, actingCharacterId(context.campaign))?.inventory.find(
      (entry) => entry.id === parameters.itemId,
    );
    if (item)
      return {
        label,
        pin,
        token: { name: item.name, icon: item.icon ?? "bag", itemDefId: item.defId ?? item.id },
        give: {
          kind: "item",
          to: (characterId) => void context.execute(giveItem, { characterId, item, equip: true }),
          canGive: (characterId) => canGive(context, characterId),
        },
      };
  }
  const target = linkTargetOf(command, parameters);
  return target?.[1]
    ? { ...entity(context, target[0], target[1], label), pin }
    : { label, pin, token: { name: label } };
}

/** Resolve a scene token back to the library entry it represents. */
export function tokenEntity(context: CampaignContext, token: TokenElement): DragEntity | null {
  const { campaign } = context;
  const extra = token as TokenElement & {
    entityRef?: { kind: string; id: string };
    graphic?: EntityGraphic;
  };
  let kind = extra.entityRef?.kind ?? "";
  if (token.characterId) kind = "character";
  else if (token.itemDefId) kind = "item";
  const id = token.characterId ?? token.itemDefId ?? extra.entityRef?.id;
  if (!id || !["character", "item", "move", "note", "scene"].includes(kind)) return null;
  const linkKind = kind as LinkKind;
  if (linkLabel(campaign, linkKind, id) === null) return null;
  const dragged =
    kind === "item" && token.itemDefId
      ? itemTokenEntity(context, token)
      : entity(context, linkKind, id, token.name);
  if (!dragged) return null;
  dragged.label = token.name;
  dragged.token = {
    ...dragged.token,
    name: token.name,
    ...(token.icon ? { icon: token.icon } : {}),
    ...(token.itemDefId ? { itemDefId: token.itemDefId } : {}),
    ...(extra.graphic ? { graphic: extra.graphic } : {}),
    ...tokenLook(token),
  };
  return dragged;
}
