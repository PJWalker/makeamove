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
  const {
    query,
    setQuery,
    cursor,
    setCursor,
    inputRef,
    listRef,
    rootRef,
    results,
    active,
    menu,
    setMenu,
    note,
    empty,
    rowTriggers,
    choose,
    onKeyDown,
  } = usePalette(campaign);
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

function usePalette(campaign: Campaign) {
  const ctx = useCampaign();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDialogElement>(null);
  const index = useMemo(() => listActions(ctx), [ctx]);
  const recent = useQuery(ctx.recent.ids);
  const ranked = rank(index, query, { recent });
  const formula = diceFormula(query);
  const typedRoll = formula ? findAction(ctx, callKey(roll.id, { formula })) : undefined;
  const results = typedRoll
    ? [typedRoll, ...ranked.filter((action) => action.id !== typedRoll.id)]
    : ranked;
  const active = Math.min(cursor, Math.max(0, results.length - 1));
  const returnTo = useRef<Element | null>(document.activeElement);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [note, setNote] = useState("");
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    showFromOrigin(element, () => {});
    return ctx.table.showingPalette(element);
  }, [ctx]);

  function togglePin(action: Action) {
    const pinned = isPinned(campaign, action.id);
    if (pinned) ctx.execute(unpinFromHotbar, { key: action.id });
    else ctx.execute(pinToHotbar, { key: action.id });
    setNote(
      pinned ? `Removed ${action.title} from the hotbar` : `Added ${action.title} to the hotbar`,
    );
  }

  function rowTriggers(action: Action, index: number) {
    const trigger = menuTrigger((x, y) => {
      setCursor(index);
      setMenu({
        x,
        y,
        items: [
          ...actionMenuItems(ctx, [{ id: action.id, title: action.title }], () =>
            ctx.table.closePalette(),
          ),
          ...(action.available === true ? [{ label: "Run", onSelect: () => choose(action) }] : []),
        ],
      });
    });
    return {
      onContextMenu: trigger.onContextMenu,
      onPointerDown(event: ReactPointerEvent) {
        trigger.onPointerDown(event);
        const what = actionEntity(ctx, action.id, action.title);
        dragEntity(ctx.canvas, event, {
          ...what,
          pin: (slot) => {
            ctx.execute(pinToHotbar, { key: action.id, at: slot });
            setNote(`Added ${action.title} to the hotbar`);
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
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!rootRef.current?.contains(target) && !target.closest?.(".context-menu, .hotbar-palette"))
        ctx.table.closePalette();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [ctx]);

  function choose(action: Action | undefined, secondary = false) {
    if (!action || action.available !== true) return;
    const callback = secondary ? action.open : action.run;
    if (!callback) return;
    ctx.table.closePalette();
    ctx.recent.note(action.id);
    queueMicrotask(callback);
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "Escape" && menu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      ctx.table.closePalette();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const count = results.length;
      if (count) setCursor((active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
    } else if (event.key === "Enter" && event.altKey) {
      event.preventDefault();
      const action = results[active];
      if (action) togglePin(action);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active], event.shiftKey);
    }
  }

  return {
    ctx,
    query,
    setQuery,
    cursor,
    setCursor,
    inputRef,
    listRef,
    rootRef,
    results,
    active,
    menu,
    setMenu,
    note,
    empty: !query,
    rowTriggers,
    choose,
    onKeyDown,
  };
}
