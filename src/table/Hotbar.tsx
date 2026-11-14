import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { actingCharacterId } from "../features/characters/api";
import { hotbarSlots, placeAt, shift, unpin } from "../features/characters/hotbar";
import { shortcutFor, showCombo, slotLook } from "../workspace/commands/custom";
import { setSlots } from "../workspace/commands/campaign";
import { findAction } from "../workspace/commands/views";
import type { Campaign } from "../campaign/campaign";
import { notePressed } from "../ui/pressed";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { ENTRY_ICONS } from "../ui/entryIcons";
import { IconDelete, IconImage, IconRename, IconSearch, IconShortcut } from "../ui/icons";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { dropMarker, dropOn, dropTargetAt, setDropCursor } from "../workspace/entityDrag";
import { actionEntity } from "../workspace/dragEntities";
import { isTyping } from "../ui/keys";
import { startReorder } from "../ui/reorder";
import { scrollSideways } from "../ui/wheel";
import { useCampaign } from "../workspace/campaignContext";
import { useDockStripLayout } from "./dockStrip";

/**
 * Pinned actions for the selected character, docked at the bottom centre.
 * Drag a slot to reorder it, or drag it off the bar to remove it. With a
 * slot focused, Alt+Left/Right reorder and Delete removes, for the keyboard.
 * Right-click a slot to rename it, give it an icon or a shortcut.
 */
export function Hotbar({ campaign }: { campaign: Campaign }) {
  // Rebuilt from the campaign's Yjs data on every change, which changes in place, so
  // React Compiler's memoizing would keep the old slots.
  "use no memo";
  const ctx = useCampaign();
  const charId = useQuery(campaign.members, () => actingCharacterId(campaign));
  const [dragging, setDragging] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useDockStripLayout(barRef, "bottom");
  // Rebuilt on any change to characters or members so labels and availability stay current.
  const [, setTick] = useState(0);
  const bumpTick = useEffectEvent(() => setTick((n) => n + 1));
  useEffect(() => {
    const bump = () => bumpTick();
    const stopCharacters = campaign.characters.observe(bump);
    const stopMembers = campaign.members.observe(bump);
    return () => {
      stopCharacters();
      stopMembers();
    };
  }, [campaign]);
  // Session-limited moves change with the chat.
  useQuery(campaign.chat.messages);

  const slots = hotbarSlots(campaign, charId);
  const find = (id: string) => findAction(ctx, id);
  const run = (id: string) => {
    const a = find(id);
    if (a?.available !== true) return;
    ctx.recent.note(a.id);
    a.run();
  };

  // 1–9 trigger the first nine slots.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const id = slots[Number(e.key) - 1];
      if (id) {
        e.preventDefault();
        // Whatever the slot starts appears beside it, as if it were clicked.
        notePressed(barRef.current?.querySelectorAll(".hotbar-slot > .btn")[Number(e.key) - 1]);
        run(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const edit = (fn: (s: string[]) => string[]) => ctx.execute(setSlots, { slots: fn(slots) });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const slotMenu = (id: string, title: string) =>
    menuTrigger((x, y) => {
      setMenu({
        x,
        y,
        items: [
          {
            label: `Run ${title}`,
            disabled: find(id)?.available !== true,
            onSelect: () => run(id),
          },
          ...(slots.length > 1
            ? [
                "divider" as const,
                {
                  label: "Move Earlier",
                  disabled: slots.indexOf(id) <= 0,
                  onSelect: () => edit((s) => shift(s, id, -1)),
                },
                {
                  label: "Move Later",
                  disabled: slots.indexOf(id) === slots.length - 1,
                  onSelect: () => edit((s) => shift(s, id, 1)),
                },
              ]
            : []),
          "divider",
          {
            label: "Rename…",
            Icon: IconRename,
            onSelect: () => ctx.table.editAction("rename", id, title),
          },
          {
            label: "Change Icon…",
            Icon: IconImage,
            onSelect: () => ctx.table.editAction("icon", id, title),
          },
          {
            label: shortcutFor(campaign, id) ? "Change Shortcut…" : "Add Shortcut…",
            Icon: IconShortcut,
            onSelect: () => ctx.table.editAction("shortcut", id, title),
          },
          "divider",
          {
            label: "Remove from Hotbar",
            Icon: IconDelete,
            danger: true,
            onSelect: () => edit((s) => unpin(s, id)),
          },
        ],
      });
    });
  const endDrag = () => {
    setDragging(null);
  };
  const dragSlot = (id: string, e: ReactPointerEvent) => {
    // Off the bar, a slot can land on a character or in a note, like a palette result; anywhere else unpins it.
    const what = actionEntity(ctx, id, find(id)?.title ?? id);
    const mark = dropMarker(ctx.canvas);
    startReorder({
      event: e,
      axis: "x",
      container: barRef.current,
      items: () => [...barRef.current!.querySelectorAll<HTMLElement>(".hotbar-slot")],
      onLift: () => setDragging(id),
      onMove: (ev, inside) => {
        const target = inside ? null : dropTargetAt(ctx.canvas, ev.clientX, ev.clientY, what);
        mark(target);
        setDropCursor(inside ? null : !!target);
      },
      onEnd: () => {
        mark(null);
        setDropCursor(null);
        endDrag();
      },
      onDrop: (index) => edit((s) => placeAt(s, id, index)),
      outside: {
        when: "release",
        run: (ev) => {
          const target = dropTargetAt(ctx.canvas, ev.clientX, ev.clientY, what);
          if (target) dropOn(ctx.canvas, target, what, ev.clientX, ev.clientY);
          else edit((s) => unpin(s, id));
        },
      },
    });
  };

  return (
    <>
      <div
        ref={barRef}
        className="dock-strip hotbar strip across dock-bottom"
        role="toolbar"
        aria-label="Hotbar"
        data-dragging={dragging !== null}
        onWheel={scrollSideways}
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
              className="hotbar-slot"
              data-unavailable={off}
              data-dragging={dragging === id}
              {...trigger}
              onPointerDown={(e) => {
                trigger.onPointerDown(e);
                dragSlot(id, e);
              }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                aria-disabled={off}
                title={combo ? `${tip} (${showCombo(combo)})` : tip}
                onClick={() => run(id)}
                onKeyDown={(e) => {
                  if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                    e.preventDefault();
                    edit((s) => shift(s, id, e.key === "ArrowLeft" ? -1 : 1));
                  } else if (e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                    edit((s) => unpin(s, id));
                  }
                }}
              >
                {Icon && <Icon size={22} />}
                <span>{label}</span>
              </button>
            </div>
          );
        })}
        <Button
          variant="icon"
          className="hotbar-palette"
          label="Command palette (Ctrl/Cmd+K)"
          onClick={() => ctx.table.togglePalette()}
        >
          <IconSearch size={22} />
        </Button>
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}
