import { shortcutFor, showCombo } from "./commands/custom";
import { hotbarSlots, isPinned, MAX_SLOTS } from "../features/characters/hotbar";
import { actingCharacterId } from "../features/characters/api";
import type { CampaignContext } from "./campaignContext";
import { pinToHotbar, unpinFromHotbar } from "./commands/campaign";
import { findAction } from "./commands/views";
import { IconAdd, IconDelete, IconShortcut } from "../ui/icons";
import type { MenuItem } from "../ui/ContextMenu";

export interface ActionMenuTarget {
  /** The call's key. */
  id: string;
  title?: string | undefined;
}

/** Context-menu entries for calls that can be pinned or given a shortcut. */
export function actionMenuItems(
  ctx: CampaignContext,
  targets: ActionMenuTarget[],
  beforeShortcut?: () => void,
): MenuItem[] {
  const { campaign } = ctx;
  const resolved = targets.flatMap(({ id, title }) => {
    const action = findAction(ctx, id);
    return action ? [{ id, title: title ?? action.title }] : [];
  });
  const multiple = resolved.length > 1;

  return resolved.flatMap(({ id, title }) => {
    const pinned = isPinned(campaign, id);
    const shortcut = shortcutFor(campaign, id);
    const name = multiple ? ` ${title}` : "";
    return [
      {
        label: pinned ? `Remove${name} from Hotbar` : `Add${name} to Hotbar`,
        Icon: pinned ? IconDelete : IconAdd,
        disabled: !pinned && hotbarSlots(campaign, actingCharacterId(campaign)).length >= MAX_SLOTS,
        onSelect: () =>
          void (pinned
            ? ctx.execute(unpinFromHotbar, { key: id })
            : ctx.execute(pinToHotbar, { key: id })),
      },
      {
        label: `${shortcut ? "Change" : "Add"} Shortcut${multiple ? ` for ${title}` : ""}…`,
        Icon: IconShortcut,
        ...(shortcut ? { shortcut: showCombo(shortcut) } : {}),
        onSelect: () => {
          beforeShortcut?.();
          ctx.table.editAction("shortcut", id, title);
        },
      },
    ] satisfies MenuItem[];
  });
}
