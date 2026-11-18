import { actingCharacterId, canEdit, getCharacter, systemOf } from "../features/characters/api";
import { getNote } from "../features/notes/api";
import type { MenuItem } from "../ui/ContextMenu";
import { IconImage, IconOpenWindow, IconSidebar } from "../ui/icons";
import { actionMenuItems } from "./actionMenu";
import type { CampaignContext } from "./campaignContext";
import { giveItem, startMove } from "./commands/characters";
import type { LinkRef } from "./linkState";

/** The primary action exposed by a linked item or move. */
export function linkActionItems(ctx: CampaignContext, link: LinkRef): MenuItem[] {
  const { campaign } = ctx;
  if (link.kind !== "item" && link.kind !== "move") return [];
  const me = getCharacter(campaign, actingCharacterId(campaign));
  const canAct = !!me && canEdit(campaign, me);
  /** One entry that acts for the acting character, dimmed when they can't. */
  const actAs = (label: string, act: (characterId: string) => void): MenuItem[] => [
    {
      label,
      disabled: !canAct,
      onSelect: () => {
        if (me && canAct) act(me.id);
      },
    },
  ];
  const system = systemOf(campaign);
  if (link.kind === "item") {
    const item = system.items.find((candidate) => candidate.id === link.id);
    if (!item) return [];
    return actAs(me ? `Give to ${me.name}` : "Choose a Character", (characterId) =>
      ctx.execute(giveItem, { characterId, item }),
    );
  }
  const move = system.actions.find((candidate) => candidate.id === link.id);
  if (!move) return [];
  return actAs(`Make ${move.name}`, (characterId) =>
    ctx.execute(startMove, { characterId, move: move.id }),
  );
}

/**
 * The right-click menu sections for a link, wherever it appears: its primary
 * action, pinning, changing its graphic, and opening it elsewhere. `title` is
 * what the link says; `openInWindow` is absent where a click already does that.
 */
export function linkMenuSections(
  ctx: CampaignContext,
  link: LinkRef,
  { title, openInWindow }: { title: string | undefined; openInWindow?: () => void },
): MenuItem[][] {
  const { kind, id } = link;
  const actionId = kind === "move" ? `move:${id}` : kind === "item" ? `library:${id}` : null;
  const canChangeGraphic = kind !== "note" || !getNote(ctx.campaign, id)?.gmOnly;
  return [
    linkActionItems(ctx, link),
    actionId ? actionMenuItems(ctx, [{ id: actionId, title }]) : [],
    canChangeGraphic
      ? [
          {
            label: "Change Graphic…",
            Icon: IconImage,
            onSelect: () => ctx.table.editGraphic(kind, id, title ?? "Entity"),
          },
        ]
      : [],
    [
      {
        label: "Open in Sidebar",
        Icon: IconSidebar,
        onSelect: () => ctx.links.openInSidebar(kind, id),
      },
      ...(openInWindow
        ? [{ label: "Open in a Window", Icon: IconOpenWindow, onSelect: openInWindow }]
        : []),
    ],
  ];
}
