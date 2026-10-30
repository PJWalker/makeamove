import { signal, useSignal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useLayoutEffect } from 'preact/hooks'
import { checkOf } from '../characters/moves'
import type { ActionDef, GameSystem } from '../systems/types'
import { morphOpen } from '../ui/morph'
import { raisePopup } from '../ui/popup'
import type { Icon } from '../ui/icons'
import { hideTooltip } from '../ui/Tooltip'
import { ListRow } from '../ui/List'
import type { WindowProxy } from './CampaignDialogs'
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { entityTabId, registerEntityWindow, closeEntityWindow, entityWindows } from './entityWindows'
import { layout, locate, showPanel } from './panelLayout'
import type { DockItemId } from './panelLayout'

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

const openEntries = signal<string[]>(Object.keys(entityWindows.value)
  .filter((id) => id.startsWith('entity:entry:'))
  .map((id) => id.slice('entity:entry:'.length)))

/** Which entries have windows open, and how to open one from its row. */
export function useEntryWindows() {
  return {
    keys: openEntries.value,
    /** Open the window for `key`, morphing it out of the row's tooltip (or the row). */
    show(key: string, row: Element) {
      const id = entityTabId(`entry:${key}`)
      if (locate(layout.value, id) !== 'closed') {
        showPanel(id)
        return
      }
      const already = document.querySelector<HTMLElement>(`dialog[data-window-id="${CSS.escape(id)}"]`)
      if (already) return raisePopup(already)
      const tip = document.querySelector('.tooltip:popover-open')
      morphOpen(tip ?? row, () => {
        hideTooltip()
        openEntries.value = [...new Set([...openEntries.value, key])]
      })
    },
    close(key: string) {
      openEntries.value = openEntries.value.filter((k) => k !== key)
      closeEntityWindow(entityTabId(`entry:${key}`))
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
  windowId,
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
  /** Shared identity when this entry is opened from a link popup. */
  windowId?: DockItemId;
  /** The actions along the bottom. */
  children?: ComponentChildren;
}) {
  const id = windowId ?? entityTabId(`entry:${entryKey}`)
  useLayoutEffect(() => {
    registerEntityWindow({
      id,
      title,
      text,
      tags,
      proxy,
      menuItems,
      close: onClose,
      content: <>
        <p class="move-text move-window-text">{text}</p>
        {children && <div class="form-actions">{children}</div>}
      </>,
    })
  }, [id, title, text, tags, proxy, menuItems, onClose, children])
  return null
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
