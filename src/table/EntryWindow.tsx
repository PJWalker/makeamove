import { useSignal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { checkOf } from '../characters/moves'
import type { ActionDef, GameSystem } from '../systems/types'
import { morphOpen } from '../ui/morph'
import { openPopup, raisePopup } from '../ui/popup'
import type { Icon } from '../ui/icons'
import { hideTooltip } from '../ui/Tooltip'
import { ListRow } from '../ui/List'
import { Dialog, type WindowProxy } from './CampaignDialogs'
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "./ContextMenu";

/*
 * Rows that show their rules in a tooltip beside them and, when clicked,
 * turn that tooltip into a window of its own: moves on a sheet, items in an
 * inventory, entries in the Libraries. One window per entry; clicking the
 * row again brings it forward.
 */

/** What an action rolls, as a short tag for its row: a stat, "any", or what it asks for. */
export function rollTag(system: GameSystem, m: ActionDef) {
  const check = checkOf(m)
  if (!check) return null
  if (check.ask?.kind === 'stat') return 'any'
  if (check.ask?.kind === 'number') return check.ask.label.toLowerCase()
  return system.stats.find((s) => s.id === check.stat)?.abbr ?? check.stat ?? null
}

/** Which entries have windows open, and how to open one from its row. */
export function useEntryWindows() {
  const open = useSignal<string[]>([])
  return {
    keys: open.value,
    /** Open the window for `key`, morphing it out of the row's tooltip (or the row). */
    show(key: string, row: Element) {
      const already = document.querySelector<HTMLElement>(`dialog[data-entry="${CSS.escape(key)}"]`)
      if (already) return raisePopup(already)
      const tip = document.querySelector('.tooltip:popover-open')
      morphOpen(tip ?? row, () => {
        hideTooltip()
        open.value = [...open.value, key]
      })
    },
    close(key: string) {
      open.value = open.value.filter((k) => k !== key)
    },
  }
}

/** An entry's rules in a window of its own. */
export function EntryWindow({
  entryKey,
  title,
  text,
  tags,
  onClose,
  proxy,
  menuItems,
  children,
}: {
  entryKey: string;
  title: string;
  text: string;
  tags?: string[];
  onClose: () => void;
  /** The entry as a draggable icon in the title bar. */
  proxy?: WindowProxy;
  /** Context-menu actions for this entry. */
  menuItems?: MenuItem[];
  /** The actions along the bottom. */
  children?: ComponentChildren;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const menu = useSignal<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => (menu.value = { x, y }));
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.dataset.entry = entryKey;
    openPopup(dialog);
  }, []);
  return (
    <>
      <Dialog
        dialogRef={ref}
        title={title}
        onClose={onClose}
        proxy={proxy}
        contextMenu={menuItems?.length ? trigger : undefined}
      >
        <p class="move-text move-window-text">{text}</p>
        {tags && tags.length > 0 && (
          <p class="muted item-tags">{tags.join(", ")}</p>
        )}
        {children && <div class="form-actions">{children}</div>}
      </Dialog>
      {menu.value && menuItems && (
        <ContextMenu
          {...menu.value}
          items={menuItems}
          onClose={() => (menu.value = null)}
        />
      )}
    </>
  );
}

/**
 * One entry as a list row: its text as a tooltip beside it, and the name
 * opening its window.
 */
export function EntryRow({
  name,
  Icon,
  tag,
  meta,
  tip,
  onOpen,
  onPointerDown,
  menuItems,
  dim,
  children,
}: {
  name: string;
  Icon?: Icon;
  tag?: string | null;
  meta?: string;
  tip: string;
  onOpen: (row: Element) => void;
  /** For rows that can be dragged somewhere. */
  onPointerDown?: (e: PointerEvent) => void;
  /** Context-menu actions for this entry. */
  menuItems?: MenuItem[];
  /** Shown faded, such as an item that's unequipped. */
  dim?: boolean;
  children?: ComponentChildren;
}) {
  const menu = useSignal<{ x: number; y: number } | null>(null);
  const trigger = menuTrigger((x, y) => (menu.value = { x, y }));
  return (
    <>
      <ListRow
        lead={Icon && <Icon size={18} />}
        name={name}
        tag={tag}
        meta={meta}
        dim={dim}
        onPick={(e) => onOpen(e.currentTarget.closest("li")!)}
        row={{
          "data-draggable": onPointerDown ? true : undefined,
          "data-tip": tip,
          "data-tip-long": true,
          "data-tip-side": true,
          "data-tip-opens": true,
          onPointerDown: (e) => {
            if (menuItems?.length) trigger.onPointerDown(e);
            onPointerDown?.(e);
          },
          onContextMenu: menuItems?.length ? trigger.onContextMenu : undefined,
        }}
      >
        {children}
      </ListRow>
      {menu.value && menuItems && (
        <ContextMenu
          {...menu.value}
          items={menuItems}
          onClose={() => (menu.value = null)}
        />
      )}
    </>
  );
}
