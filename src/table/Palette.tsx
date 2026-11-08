import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { store } from "../lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { noteRecent, recentActions } from "./commands/recent";
import { rollAction } from "./commands/core";
import {
  actionForCombo,
  comboOf,
  firesWhileTyping,
  shortcutFor,
  shortcuts,
  showCombo,
} from "./commands/custom";
import { buildIndex, findAction } from "./commands/registry";
import { diceFormula } from "../features/chat/commands";
import { rank } from "./commands/search";
import type { Action } from "./commands/types";
import { editHotbar, insertAt, isPinned, pin, unpin } from "../features/characters/hotbar";
import { isTyping } from "../ui/keys";
import { RECORDER } from "./ActionDialogs";
import { actionMenuItems } from "./actionMenu";
import { actionEntity, dragEntity } from "./entityDrag";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import type { Campaign } from "../campaign/campaign";
import { useValue } from "../ui/useValue";

export const paletteOpen = store(false);
const closePalette = () => {
  paletteOpen.value = false;
};

export function Palette({ campaign }: { campaign: Campaign }) {
  const open = useValue(paletteOpen);

  // Ctrl/Cmd + K toggles, even from a text field, as in most apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        paletteOpen.value = !paletteOpen.value;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The player's own shortcuts, ahead of the app's (captured, so a tool key bound to something else stays bound).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as Element | null)?.closest?.(`.${RECORDER}`)) return;
      const combo = comboOf(e);
      if (!combo) return;
      const id = actionForCombo(shortcuts(campaign), combo);
      if (!id || (isTyping(e.target) && !firesWhileTyping(combo))) return;
      const a = findAction(campaign, id);
      if (a?.available !== true) return;
      e.preventDefault();
      e.stopPropagation();
      closePalette();
      noteRecent(a.id);
      a.run();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [campaign]);

  return open ? <PaletteBody campaign={campaign} /> : null;
}

function PaletteBody({ campaign }: { campaign: Campaign }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The index is built once per opening, from whatever is current then.
  const index = useMemo(() => buildIndex(campaign), [campaign]);
  const recent = useValue(recentActions);
  const ranked = rank(index, query, { recent });
  // A dice formula typed on its own rolls it, first in the list.
  const formula = diceFormula(query);
  const roll = formula ? rollAction(campaign, formula) : null;
  const results = roll ? [roll, ...ranked.filter((a) => a.id !== roll.id)] : ranked;
  const active = Math.min(cursor, Math.max(0, results.length - 1));
  const returnTo = useRef<Element | null>(document.activeElement);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [note, setNote] = useState("");

  function togglePin(a: Action) {
    const pinned = isPinned(campaign, a.id);
    if (editHotbar(campaign, (slots) => (pinned ? unpin(slots, a.id) : pin(slots, a.id)))) {
      setNote(pinned ? `Removed ${a.title} from the hotbar` : `Added ${a.title} to the hotbar`);
    }
  }

  /** Right-click for a menu; press and drag to pin the action onto the hotbar. */
  function rowTriggers(a: Action, i: number) {
    const trigger = menuTrigger((x, y) => {
      setCursor(i);
      setMenu({
        x,
        y,
        items: [
          ...actionMenuItems(campaign, [{ id: a.id, title: a.title }], closePalette),
          ...(a.available === true ? [{ label: "Run", onSelect: () => choose(a) }] : []),
        ],
      });
    });
    return {
      onContextMenu: trigger.onContextMenu,
      onPointerDown(e: ReactPointerEvent) {
        trigger.onPointerDown(e);
        // Onto the hotbar, a character or a note.
        const what = actionEntity(campaign, a.id, a.title);
        dragEntity(e, {
          ...what,
          pin: (index) => {
            if (editHotbar(campaign, (slots) => insertAt(slots, a.id, index)))
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
        closePalette();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  function choose(a: Action | undefined, secondary = false) {
    if (!a || a.available !== true) return;
    const fn = secondary ? a.open : a.run;
    if (!fn) return;
    closePalette();
    noteRecent(a.id);
    // After the palette has closed and given focus back.
    queueMicrotask(fn);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape" && menu) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
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
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="palette panel"
      role="dialog"
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
          const combo = shortcutFor(campaign, a.id);
          const hint = combo ? showCombo(combo) : a.hint;
          return (
            // Options are chosen by keyboard through the dialog's onKeyDown.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
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
      <p className="palette-note" role="status">
        {note}
      </p>
    </div>
  );
}
