import { store } from "../lib/store";
import { canEdit, getCharacter, actingCharacterId, systemOf } from "../features/characters/api";
import type { LinkKind } from "../features/notes/links";
import { morphOpen } from "../ui/morph";
import { raisePopup } from "../ui/popup";
import { hideTooltip } from "../ui/Tooltip";
import type { MenuItem } from "../ui/ContextMenu";
import { entityTabId } from "./entityWindowState";
import { locate } from "./layoutModel";
import type { PanelLayout } from "./panelLayout";
import { giveItem, startMove } from "./commands/characters";
import type { CampaignContext } from "./campaignContext";

/*
 * What links in rich text have open: pop-ups showing what they point at,
 * a right-click menu, and the little pop-up that renames a link. Drawn by
 * LinkPopups.tsx; kept apart so the editor needn't import the sheets and
 * pages those pop-ups show.
 */

export interface LinkRef {
  kind: LinkKind;
  id: string;
}

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

export const linkKey = (l: LinkRef) => `${l.kind}:${l.id}`;

/** What links in rich text have open, per campaign. */
export class LinkPopups {
  /** Links with a pop-up open, oldest first. */
  readonly openLinks = store<LinkRef[]>([]);

  /** A link's right-click menu, where it was opened. */
  readonly linkMenu = store<{ x: number; y: number; items: MenuItem[] } | null>(null);

  /** Renaming a link: its text now, and what saving does (null puts the target's own name back). */
  readonly linkRename = store<{
    n: number;
    text: string;
    custom: boolean;
    save: (text: string | null) => void;
  } | null>(null);

  #renames = 0;

  constructor(private readonly panels: PanelLayout) {}

  /** Open a link's pop-up, growing out of its tooltip (or the link itself); bring it forward if it's open. */
  show(link: LinkRef, from: Element) {
    const id = entityTabId(`link:${linkKey(link)}`);
    if (locate(this.panels.layout.value, id) !== "closed") {
      this.panels.showPanel(id);
      return;
    }
    const already = document.querySelector<HTMLElement>(
      `dialog[data-entry="${CSS.escape(`link:${linkKey(link)}`)}"]`,
    );
    if (already) return raisePopup(already);
    const tip = document.querySelector(".tooltip:popover-open");
    morphOpen(tip ?? from, () => {
      hideTooltip();
      this.openLinks.value = [...this.openLinks.value, link];
    });
  }

  close(link: LinkRef) {
    this.openLinks.value = this.openLinks.value.filter((l) => linkKey(l) !== linkKey(link));
  }

  /** Ask to rename a link; each request gets its own pop-up. */
  rename(req: { text: string; custom: boolean; save: (text: string | null) => void }) {
    this.linkRename.value = { ...req, n: ++this.#renames };
  }
}
