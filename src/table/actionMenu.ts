import { findAction } from "../app/commands/registry";
import { shortcutFor, showCombo } from "../app/commands/custom";
import {
  editHotbar,
  hotbarSlots,
  isPinned,
  MAX_SLOTS,
  pin,
  unpin,
} from "../features/characters/hotbar";
import { selectedCharacterId } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { IconAdd, IconDelete, IconShortcut } from "../ui/icons";
import type { MenuItem } from "./ContextMenu";
import { editAction } from "./ActionDialogs";

export interface ActionMenuTarget {
  id: string;
  title?: string | undefined;
}

/** Context-menu actions for entries that can be pinned or assigned a shortcut. */
export function actionMenuItems(
  campaign: Campaign,
  targets: ActionMenuTarget[],
  beforeShortcut?: () => void,
): MenuItem[] {
  const resolved = targets.flatMap(({ id, title }) => {
    const action = findAction(campaign, id);
    return action ? [{ id, title: title ?? action.title }] : [];
  });
  const multiple = resolved.length > 1;

  return resolved.flatMap(({ id, title }) => {
    const pinned = isPinned(campaign, id);
    const shortcut = shortcutFor(campaign, id);
    const name = multiple ? ` ${title}` : "";
    return [
      {
        label: pinned ? `Remove${name} from hotbar` : `Add${name} to hotbar`,
        Icon: pinned ? IconDelete : IconAdd,
        disabled:
          !pinned && hotbarSlots(campaign, selectedCharacterId(campaign)).length >= MAX_SLOTS,
        onSelect: () =>
          editHotbar(campaign, (slots) => (pinned ? unpin(slots, id) : pin(slots, id))),
      },
      {
        label: `${shortcut ? "Change" : "Add"} shortcut${multiple ? ` for ${title}` : ""}…`,
        Icon: IconShortcut,
        ...(shortcut ? { shortcut: showCombo(shortcut) } : {}),
        onSelect: () => {
          beforeShortcut?.();
          editAction("shortcut", id, title);
        },
      },
    ] satisfies MenuItem[];
  });
}
