import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { selectedCharacterId } from '../characters/api'
import { editHotbar, hotbarSlots, placeAt, shift, unpin } from '../characters/hotbar'
import { shortcutFor, showCombo, slotLook } from '../actions/custom'
import { buildIndex, pinnedRoll } from '../actions/registry'
import { noteRecent } from '../actions/recent'
import type { Campaign } from '../store/campaign'
import { useY } from '../store/useY'
import { Button } from '../ui/Button'
import { ENTRY_ICONS } from '../ui/entryIcons'
import { IconDelete, IconImage, IconRename, IconSearch, IconShortcut } from '../ui/icons'
import { menuTrigger } from '../ui/menuTrigger'
import { editAction } from './ActionDialogs'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { actionEntity, dropMarker, dropOn, dropTargetAt } from './entityDrag'
import { paletteOpen } from './Palette'
import { isTyping } from '../ui/keys'
import { startReorder } from '../ui/reorder'

/**
 * Pinned actions for the selected character, docked at the bottom centre.
 * Drag a slot to reorder it, or drag it off the bar to remove it. With a
 * slot focused, Alt+Left/Right reorder and Delete removes, for the keyboard.
 * Right-click a slot to rename it, give it an icon or a shortcut.
 */
export function Hotbar({ campaign }: { campaign: Campaign }) {
  const charId = useY(campaign.members, () => selectedCharacterId(campaign))
  const dragging = useSignal<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  // Rebuilt on any change to characters or members so labels and availability stay current.
  const tick = useSignal(0)
  useEffect(() => {
    const bump = () => tick.value++
    campaign.characters.observeDeep(bump)
    campaign.members.observeDeep(bump)
    return () => {
      campaign.characters.unobserveDeep(bump)
      campaign.members.unobserveDeep(bump)
    }
  }, [campaign])
  void tick.value

  const slots = hotbarSlots(campaign, charId)
  const index = new Map(buildIndex(campaign).map((a) => [a.id, a]))
  const find = (id: string) => index.get(id) ?? pinnedRoll(campaign, id)
  const run = (id: string) => {
    const a = find(id)
    if (a?.available !== true) return
    noteRecent(a.id)
    a.run()
  }

  // 1–9 trigger the first nine slots.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return
      if (!/^[1-9]$/.test(e.key)) return
      const id = slots[Number(e.key) - 1]
      if (id) {
        e.preventDefault()
        run(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const edit = (fn: (s: string[]) => string[]) => editHotbar(campaign, fn)
  const menu = useSignal<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const slotMenu = (id: string, title: string) =>
    menuTrigger((x, y) => {
      menu.value = {
        x,
        y,
        items: [
          { label: 'Rename…', Icon: IconRename, onSelect: () => editAction('rename', id, title) },
          { label: 'Change icon…', Icon: IconImage, onSelect: () => editAction('icon', id, title) },
          {
            label: shortcutFor(campaign, id) ? 'Change shortcut…' : 'Add shortcut…',
            Icon: IconShortcut,
            onSelect: () => editAction('shortcut', id, title),
          },
          'divider',
          { label: 'Remove from hotbar', Icon: IconDelete, danger: true, onSelect: () => edit((s) => unpin(s, id)) },
        ],
      }
    })
  const endDrag = () => {
    dragging.value = null
  }
  const dragSlot = (id: string, e: PointerEvent) => {
    // Off the bar, a slot can land on a character or in a note, like a palette result; anywhere else unpins it.
    const what = actionEntity(campaign, id, find(id)?.title ?? id)
    const mark = dropMarker()
    startReorder({
      event: e,
      axis: 'x',
      container: barRef.current,
      items: () => [...barRef.current!.querySelectorAll<HTMLElement>('.hotbar-slot')],
      onLift: () => (dragging.value = id),
      onMove: (ev, inside) => mark(inside ? null : dropTargetAt(ev.clientX, ev.clientY, what)),
      onEnd: () => {
        mark(null)
        endDrag()
      },
      onDrop: (index) => edit((s) => placeAt(s, id, index)),
      outside: {
        when: 'release',
        run: (ev) => {
          const target = dropTargetAt(ev.clientX, ev.clientY, what)
          if (target) dropOn(target, what, ev.clientX, ev.clientY)
          else edit((s) => unpin(s, id))
        },
      },
    })
  }

  return (
    <div class="hotbar-wrap">
      <div
        ref={barRef}
        class="hotbar panel bevel strip across dock-bottom"
        role="toolbar"
        aria-label="Hotbar"
        data-dragging={dragging.value !== null}
        onWheel={(e) => {
          // A mouse wheel scrolls the bar sideways.
          if (e.deltaY && !e.deltaX) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {slots.map((id) => {
          const a = find(id);
          if (!a) return null;
          const off = a.available !== true;
          const look = slotLook(campaign, id);
          const Icon = (look.icon && ENTRY_ICONS[look.icon]) || a.icon;
          const label = look.label ?? a.title;
          const combo = shortcutFor(campaign, id);
          const tip = off ? `${label}: ${a.available}` : (a.detail ?? label);
          const trigger = slotMenu(id, label);
          return (
            <div
              key={id}
              class="hotbar-slot"
              data-unavailable={off}
              data-dragging={dragging.value === id}
              onPointerDown={(e) => {
                trigger.onPointerDown(e);
                dragSlot(id, e);
              }}
              onContextMenu={trigger.onContextMenu}
            >
              <div
                role="button"
                tabIndex={0}
                class="hotbar-btn btn btn-ghost bevel"
                aria-disabled={off}
                title={combo ? `${tip} (${showCombo(combo)})` : tip}
                onClick={() => run(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    run(id);
                  } else if (
                    e.altKey &&
                    (e.key === "ArrowLeft" || e.key === "ArrowRight")
                  ) {
                    e.preventDefault();
                    edit((s) => shift(s, id, e.key === "ArrowLeft" ? -1 : 1));
                  } else if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    edit((s) => unpin(s, id));
                  }
                }}
              >
                {Icon && <Icon size={18} />}
                <span>{label}</span>
              </div>
            </div>
          );
        })}
        <Button
          variant="icon"
          class="hotbar-palette"
          label="Command palette (Ctrl/Cmd+K)"
          onClick={() => (paletteOpen.value = !paletteOpen.value)}
        >
          <IconSearch size={22} />
        </Button>
      </div>
      {menu.value && <ContextMenu {...menu.value} onClose={() => (menu.value = null)} />}
    </div>
  );
}
