import { useRef, useState } from "react";
import { getNote } from "../features/notes/api";
import type { LinkKind } from "../features/notes/links";
import { linkLabel, linkTip } from "../features/notes/targets";
import { openInSidebar } from "./linkNavigation";
import type { Campaign } from "../campaign/campaign";
import { menuTrigger } from "../ui/menuTrigger";
import { IconImage, IconOpenWindow, IconSidebar } from "../ui/icons";
import type { WindowProxy } from "./Dialog";
import { ContextMenu } from "../ui/ContextMenu";
import { actionMenuItems } from "./actionMenu";
import { dragEntity, entity } from "./entityDrag";
import { linkActionItems, showLink } from "./linkState";
import { editEntityGraphic } from "./GraphicDialogs";

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
  text?: string | undefined;
}) {
  const name = linkLabel(campaign, kind, id);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const linkElement = useRef<HTMLSpanElement>(null);
  const actionId = kind === "move" ? `move:${id}` : kind === "item" ? `library:${id}` : null;
  const actionItems = actionId
    ? actionMenuItems(campaign, [{ id: actionId, title: text || name || undefined }])
    : [];
  const primaryItems = linkActionItems(campaign, { kind, id });
  const canChangeGraphic = kind !== "note" || !getNote(campaign, id)?.gmOnly;
  const items = [
    {
      label: "Open in a Window",
      Icon: IconOpenWindow,
      onSelect: () => {
        if (linkElement.current) showLink({ kind, id }, linkElement.current);
      },
    },
    {
      label: "Open in Sidebar",
      Icon: IconSidebar,
      onSelect: () => openInSidebar(campaign, kind, id),
    },
    ...(primaryItems.length ? (["divider"] as const) : []),
    ...primaryItems,
    ...(actionItems.length ? (["divider"] as const) : []),
    ...actionItems,
    ...(actionItems.length && canChangeGraphic ? (["divider"] as const) : []),
    ...(canChangeGraphic
      ? [
          {
            label: "Change Graphic…",
            Icon: IconImage,
            onSelect: () => editEntityGraphic(campaign, kind, id, name ?? text ?? "Entity"),
          },
        ]
      : []),
  ];
  const trigger = menuTrigger((x, y) => setMenu({ x, y }));
  if (name === null)
    return (
      <span ref={linkElement} className="note-link" data-missing="true" data-tip="Not available">
        {text || "Unavailable"}
      </span>
    );
  const shown = text || name;
  return (
    <>
      <span
        className="note-link"
        role="link"
        tabIndex={0}
        data-kind={kind}
        data-tip={linkTip(campaign, kind, id) ?? undefined}
        data-tip-long="true"
        data-tip-opens="true"
        onClick={(e) => showLink({ kind, id }, e.currentTarget)}
        onKeyDown={(e) => e.key === "Enter" && showLink({ kind, id }, e.currentTarget)}
        onPointerDown={(e) => {
          if (items.length) trigger.onPointerDown(e);
          dragEntity(e, entity(campaign, kind, id, shown));
        }}
        onContextMenu={items.length ? trigger.onContextMenu : undefined}
      >
        {shown}
      </span>
      {menu && items.length > 0 && (
        <ContextMenu {...menu} items={items} onClose={() => setMenu(null)} />
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
    campaign,
    kind,
    id,
    defaultIcon: icon,
    entity: entity(campaign, kind, id, label),
  };
}
