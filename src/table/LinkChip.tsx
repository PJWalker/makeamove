import { useSignal } from "@preact/signals";
import type { LinkKind } from "../notes/api";
import { linkLabel, linkTip } from "../notes/targets";
import type { Campaign } from "../store/campaign";
import { menuTrigger } from "../ui/menuTrigger";
import type { WindowProxy } from "./CampaignDialogs";
import { ContextMenu } from "./ContextMenu";
import { actionMenuItems } from "./actionMenu";
import { dragEntity, entity } from "./entityDrag";
import { linkIcon } from "./richText";
import { showLink } from "./linkState";

/**
 * A link outside the editors (in a chat message): it looks and behaves like
 * one in a note. Its tooltip says what it is; a click opens its pop-up; it
 * can be dragged onto a character, the hotbar or into text.
 */
export function LinkChip({
  campaign,
  kind,
  id,
  text,
}: {
  campaign: Campaign;
  kind: LinkKind;
  id: string;
  text?: string;
}) {
  const name = linkLabel(campaign, kind, id);
  const menu = useSignal<{ x: number; y: number } | null>(null);
  const actionId =
    kind === "move" ? `move:${id}` : kind === "item" ? `library:${id}` : null;
  const items = actionId
    ? actionMenuItems(campaign, [
        { id: actionId, title: text || name || undefined },
      ])
    : [];
  const trigger = menuTrigger((x, y) => (menu.value = { x, y }));
  if (name === null)
    return (
      <span
        class="note-link bevel"
        data-missing="true"
        data-tip="Not available"
      >
        {text || "Unavailable"}
      </span>
    );
  const shown = text || name;
  return (
    <>
      <span
        class="note-link bevel"
        role="link"
        tabIndex={0}
        data-kind={kind}
        data-tip={linkTip(campaign, kind, id) ?? undefined}
        data-tip-long="true"
        data-tip-opens="true"
        onClick={(e) => showLink({ kind, id }, e.currentTarget)}
        onKeyDown={(e) =>
          e.key === "Enter" && showLink({ kind, id }, e.currentTarget)
        }
        onPointerDown={(e) => {
          if (items.length) trigger.onPointerDown(e);
          dragEntity(e, entity(campaign, kind, id, shown));
        }}
        onContextMenu={items.length ? trigger.onContextMenu : undefined}
      >
        {shown}
      </span>
      {menu.value && items.length > 0 && (
        <ContextMenu
          {...menu.value}
          items={items}
          onClose={() => (menu.value = null)}
        />
      )}
    </>
  );
}

/** A window's title-bar icon for a link target, dragging like a link to it. */
export function linkProxy(
  campaign: Campaign,
  kind: LinkKind,
  id: string,
  label: string,
  icon?: string,
): WindowProxy {
  return {
    Icon: linkIcon({ kind, icon }),
    entity: entity(campaign, kind, id, label),
  };
}
