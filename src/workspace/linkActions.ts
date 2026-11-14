import { actingCharacterId, canEdit, getCharacter, systemOf } from "../features/characters/api";
import type { MenuItem } from "../ui/ContextMenu";
import type { CampaignContext } from "./campaignContext";
import { giveItem, startMove } from "./commands/characters";
import type { LinkRef } from "./linkState";

/** The primary action exposed by a linked item or move. */
export function linkActionItems(ctx: CampaignContext, link: LinkRef): MenuItem[] {
  const { campaign } = ctx;
  if (link.kind !== "item" && link.kind !== "move") return [];
  const me = getCharacter(campaign, actingCharacterId(campaign));
  const canAct = !!me && canEdit(campaign, me);
  const system = systemOf(campaign);
  if (link.kind === "item") {
    const item = system.items.find((candidate) => candidate.id === link.id);
    return item
      ? [
          {
            label: me ? `Give to ${me.name}` : "Choose a Character",
            disabled: !canAct,
            onSelect: () => {
              if (me && canAct) ctx.execute(giveItem, { characterId: me.id, item });
            },
          },
        ]
      : [];
  }
  if (link.kind === "move") {
    const move = system.actions.find((candidate) => candidate.id === link.id);
    return move
      ? [
          {
            label: `Make ${move.name}`,
            disabled: !canAct,
            onSelect: () => {
              if (me && canAct) ctx.execute(startMove, { characterId: me.id, move: move.id });
            },
          },
        ]
      : [];
  }
  return [];
}
