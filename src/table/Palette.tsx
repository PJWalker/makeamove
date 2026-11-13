/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The command list is a searchable active-descendant listbox, not a native select. */
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { callKey } from "../kernel/commands";
import { diceFormula } from "../features/chat/slash";
import { isPinned } from "../features/characters/hotbar";
import { pinToHotbar, unpinFromHotbar } from "../workspace/commands/campaign";
import { roll } from "../workspace/commands/chat";
import { rank } from "../workspace/commands/search";
import type { Action } from "../workspace/commands/types";
import { findAction, listActions } from "../workspace/commands/views";
import { actionMenuItems } from "../workspace/actionMenu";
import { dragEntity } from "../workspace/entityDrag";
import { actionEntity } from "../workspace/dragEntities";
import { menuTrigger } from "../ui/menuTrigger";
import { showFromOrigin } from "../ui/morph";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { useCampaign } from "../workspace/campaignContext";

/** The command palette: searches every call the registry offers (commands/views.ts). */
export function Palette({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const open = useQuery(ctx.table.paletteOpen);
  return open ? <PaletteBody campaign={campaign} /> : null;
}

function PaletteBody({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDialogElement>(null);

  // The index is built once per opening, from whatever is current then.
  const index = useMemo(() => listActions(ctx), [ctx]);
  const recent = useQuery(ctx.recent.ids);
  const ranked = rank(index, query, { recent });
  // A dice formula typed on its own rolls it, first in the list.
  const formula = diceFormula(query);
  const typedRoll = formula ? findAction(ctx, callKey(roll.id, { formula })) : undefined;
  const results = typedRoll ? [typedRoll, ...ranked.filter((a) => a.id !== typedRoll.id)] : ranked;
  const active = Math.min(cursor, Math.max(0, results.length - 1));
  const returnTo = useRef<Element | null>(document.activeElement);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [note, setNote] = useState("");
  // Grow out of the button that opened it, if a button did (ui/morph.ts).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    showFromOrigin(el, () => {});
    return ctx.table.showingPalette(el);
  }, [ctx]);

  function togglePin(a: Action) {
    const pinned = isPinned(campaign, a.id);
    if (pinned) ctx.execute(unpinFromHotbar, { key: a.id });
    else ctx.execute(pinToHotbar, { key: a.id });
    setNote(pinned ? `Removed ${a.title} from the hotbar` : `Added ${a.title} to the hotbar`);
  }

  /** Right-click for a menu; press and drag to pin the action onto the hotbar. */
  function rowTriggers(a: Action, i: number) {
    const trigger = menuTrigger((x, y) => {
      setCursor(i);
      setMenu({
        x,
        y,
        items: [
          ...actionMenuItems(ctx, [{ id: a.id, title: a.title }], () => ctx.table.closePalette()),
          ...(a.available === true ? [{ label: "Run", onSelect: () => choose(a) }] : []),
        ],
      });
    });
    return {
      onContextMenu: trigger.onContextMenu,
      onPointerDown(e: ReactPointerEvent) {
        trigger.onPointerDown(e);
        // Onto the hotbar, a character or a note.
        const what = actionEntity(ctx, a.id, a.title);
        dragEntity(ctx.canvas, e, {
          ...what,
          pin: (index) => {
            ctx.execute(pinToHotbar, { key: a.id, at: index });
            setNote(`Added ${a.title} to the hotbar`);
          },
        });
      },
    };
  }

  useEffect(() => {
    inputRef.current?.focus();
    const target = returnTo.current;
    return () => {
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, []);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, results.length]);

  // A press outside closes it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!rootRef.current?.contains(t) && !t.closest?.(".context-menu, .hotbar-palette"))
        ctx.table.closePalette();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [ctx]);

  function choose(a: Action | undefined, secondary = false) {
    if (!a || a.available !== true) return;
    const fn = secondary ? a.open : a.run;
    if (!fn) return;
    ctx.table.closePalette();
    ctx.recent.note(a.id);
    // After the palette has closed and given focus back.
    queueMicrotask(fn);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape" && menu) return;
    if (e.key === "Escape") {
      e.preventDefault();
      ctx.table.closePalette();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = results.length;
      if (n) setCursor((active + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const a = results[active];
      if (a) togglePin(a);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active], e.shiftKey);
    }
  }

  const empty = !query;
  return (
    // Arrow/Enter handling for the whole palette lives on the dialog.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      open
      className="palette panel"
      aria-label="Command palette"
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <input
        ref={inputRef}
        className="palette-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={results[active] ? `palette-${active}` : undefined}
        aria-label="Search actions"
        placeholder="Search moves, tools, scenes and commands, or roll 2d6+1…"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setCursor(0);
        }}
      />
      <ul id="palette-list" className="palette-list" role="listbox" ref={listRef}>
        {results.map((a, i) => {
          const off = a.available !== true;
          const hint = a.hint;
          return (
            // Options are chosen by keyboard through the dialog's onKeyDown.
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={a.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={off}
              data-active={i === active}
              data-unavailable={off}
              onPointerMove={() => cursor !== i && setCursor(i)}
              onClick={() => choose(a)}
              {...rowTriggers(a, i)}
            >
              <span className="palette-icon">{a.icon && <a.icon size={22} />}</span>
              <span className="palette-text">
                <span className="palette-title">{a.title}</span>
                <span className="palette-detail">{off ? a.available : (a.detail ?? a.source)}</span>
              </span>
              {hint && <kbd>{hint}</kbd>}
            </li>
          );
        })}
        {!results.length && (
          <li className="palette-empty" role="presentation">
            {empty ? "Nothing recent yet. Start typing." : "No matches."}
          </li>
        )}
      </ul>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      <output className="palette-note">{note}</output>
    </dialog>
  );
}
