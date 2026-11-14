import type { PointerEvent as ReactPointerEvent } from "react";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Icon } from "../ui/icons";
import { ListRow } from "../ui/List";
import type { WindowProxy } from "./entityWindowState";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import type { DockItemId } from "./panelLayout";
import { entityTabId } from "./entityWindowState";
import { useCampaign } from "./campaignContext";

/*
 * Rows that show their rules in a tooltip beside them and, when clicked,
 * turn that tooltip into a window of its own: moves on a sheet, items in an
 * inventory, entries in the Libraries. One window per entry; clicking the
 * row again brings it forward.
 */

/** An entry's rules in a window of its own. */
export function EntryWindow({
  entryKey,
  title,
  text,
  tags,
  onClose,
  proxy,
  graphicRef,
  graphicDefaultIcon,
  menuItems,
  windowId,
  body,
  children,
}: {
  entryKey: string;
  title: string;
  text: string;
  /** Shown instead of the text, such as a move's formatted text and form. */
  body?: ReactNode | undefined;
  tags?: string[] | undefined;
  onClose: () => void;
  /** The entry as a draggable icon in the title bar. */
  proxy?: WindowProxy | undefined;
  graphicRef?: { kind: string; id: string } | undefined;
  graphicDefaultIcon?: string | undefined;
  /** Context-menu actions for this entry. */
  menuItems?: MenuItem[] | undefined;
  /** Shared identity when this entry is opened from a link popup. */
  windowId?: DockItemId | undefined;
  /** The actions along the bottom. */
  children?: ReactNode | undefined;
}) {
  const ctx = useCampaign();
  const id = windowId ?? entityTabId(`entry:${entryKey}`);
  useLayoutEffect(() => {
    ctx.windows.register({
      id,
      title,
      text,
      tags,
      graphicRef: graphicRef ?? (proxy ? { kind: proxy.kind, id: proxy.id } : undefined),
      graphicDefaultIcon: graphicDefaultIcon ?? proxy?.defaultIcon,
      proxy,
      menuItems,
      close: onClose,
      content: (
        <>
          {body ?? <p className="move-text move-window-text">{text}</p>}
          {children && <div className="form-actions">{children}</div>}
        </>
      ),
    });
  }, [
    ctx,
    id,
    title,
    text,
    tags,
    proxy,
    graphicRef,
    graphicDefaultIcon,
    menuItems,
    onClose,
    body,
    children,
  ]);
  return null;
}

/**
 * One entry as a list row: its text as a tooltip beside it, and the name
 * opening its window.
 */
export function EntryRow({
  name,
  Icon,
  lead,
  tag,
  meta,
  tip,
  onOpen,
  openLabel = "Open",
  onPointerDown,
  menuItems,
  dim,
  before,
  children,
}: {
  name: string;
  /** Before the row's button, such as a toggle to show what it holds. */
  before?: ReactNode;
  Icon?: Icon;
  lead?: ReactNode;
  tag?: string | null | undefined;
  meta?: string | undefined;
  tip: string;
  onOpen: (row: Element) => void;
  /** The context-menu verb that uses the row's normal open action. */
  openLabel?: string;
  /** For rows that can be dragged somewhere. */
  onPointerDown?: ((e: ReactPointerEvent<HTMLLIElement>) => void) | undefined;
  /** Context-menu actions for this entry. */
  menuItems?: MenuItem[] | undefined;
  /** Shown faded, such as an item that's unequipped. */
  dim?: boolean | undefined;
  children?: ReactNode | undefined;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const rowElement = useRef<Element | null>(null);
  const trigger = menuTrigger((x, y) => setMenu({ x, y }));
  const items: MenuItem[] = [
    {
      label: openLabel,
      onSelect: () => {
        if (rowElement.current?.isConnected) onOpen(rowElement.current);
      },
    },
    ...(menuItems ?? []),
  ];
  return (
    <>
      <ListRow
        lead={lead ?? (Icon && <Icon size={22} />)}
        name={name}
        tag={tag}
        meta={meta}
        dim={dim}
        before={before}
        onPick={(e) => onOpen(e.currentTarget.closest("li")!)}
        row={{
          "data-draggable": onPointerDown ? true : undefined,
          "data-tip": tip,
          "data-tip-long": true,
          "data-tip-side": true,
          "data-tip-opens": true,
          onPointerDown: (e) => {
            rowElement.current = e.currentTarget;
            trigger.onPointerDown(e);
            onPointerDown?.(e);
          },
          onContextMenu: (e) => {
            rowElement.current = e.currentTarget;
            trigger.onContextMenu(e);
          },
        }}
      >
        {children}
      </ListRow>
      {menu && <ContextMenu {...menu} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}
