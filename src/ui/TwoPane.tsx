/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The panel's interactive splitter cannot be an hr. */
import type * as React from "react";
import { derived, store, type ReadonlyStore, type Store } from "../lib/store";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconBack, IconLayoutSingle, IconLayoutSplit } from "./icons";
import { getStorageJson, setStorageJson } from "../platform/localStorage";
import { withTransition } from "./transition";
import { useQuery } from "./useQuery";

/*
 * A panel that is a list and a detail (characters and their sheets, notes
 * and their pages), shown side by side or one at a time. Side by side, the
 * list's width can be dragged; one at a time, the two levels slide like a
 * navigation stack, with a back bar on the detail. The choice is kept per
 * device, and a panel too narrow for two columns shows one at a time
 * regardless, with the switch disabled.
 */

export type PaneLayoutMode = "split" | "stack";
export type PaneLevel = "list" | "detail";

/** Narrower than this, the list and detail take turns. */
const SPLIT_MIN_W = 381;
const DEFAULT_LIST_W = 200;

export interface PaneLayout {
  key: string;
  listWidth: Store<number>;
  chosen: Store<PaneLayoutMode>;
  tooNarrow: Store<boolean>;
  /** What actually shows. */
  mode: ReadonlyStore<PaneLayoutMode>;
  save(): void;
  /** Put the list back to its default width. */
  resetWidth(): void;
  /** The panel's two-pane element, while it's on screen. */
  el: HTMLElement | null;
  /** Record the panel's two-pane element (a ref callback). */
  attach(el: HTMLElement | null): void;
  /** The layout switch for the panel's title bar. */
  Toggle: () => React.JSX.Element;
}

/**
 * One panel's layout, kept in localStorage under `key`. `names` words the
 * switch's label: what the list and detail are ("list", "sheet").
 */
export function createPaneLayout(key: string, names: { list: string; detail: string }): PaneLayout {
  const storeKey = `makeamove.${key}`;
  const saved = getStorageJson<{ w?: number; layout?: PaneLayoutMode }>(storeKey, {});
  const listWidth = store(saved.w ?? DEFAULT_LIST_W);
  const chosen = store<PaneLayoutMode>(saved.layout ?? "split");
  const tooNarrow = store(false);
  const mode = derived<PaneLayoutMode>([tooNarrow, chosen], () =>
    tooNarrow.value ? "stack" : chosen.value,
  );
  const save = () => {
    setStorageJson(storeKey, { w: listWidth.value, layout: chosen.value });
  };

  function Toggle() {
    const split = useQuery(mode) === "split";
    const narrow = useQuery(tooNarrow);
    const label = narrow
      ? `One at a time (widen the panel to see the ${names.list} and ${names.detail} side by side)`
      : split
        ? "Side by side: click to show one at a time"
        : `One at a time: click to show the ${names.list} and ${names.detail} side by side`;
    return (
      <button
        type="button"
        className="pane-toggle"
        aria-label={label}
        title={label}
        aria-pressed={split}
        disabled={narrow}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          chosen.value = split ? "stack" : "split";
          save();
        }}
      >
        {split ? <IconLayoutSplit size={22} /> : <IconLayoutSingle size={22} />}
      </button>
    );
  }

  const layout: PaneLayout = {
    key,
    listWidth,
    chosen,
    tooNarrow,
    mode,
    save,
    resetWidth: () => {
      listWidth.value = DEFAULT_LIST_W;
      save();
    },
    el: null,
    attach: (el) => {
      layout.el = el;
    },
    Toggle,
  };
  return layout;
}

/**
 * Which level shows when they take turns, and how to move between them:
 * one at a time, the move slides; side by side, both already show. `show`
 * is `go` for callers that need to wait until the level is showing.
 */
export function usePaneLevel(layout: PaneLayout, initial: PaneLevel) {
  const [level, setLevel] = useState<PaneLevel>(initial);
  const show = useCallback(
    async (to: PaneLevel): Promise<void> => {
      if (level === to) return;
      if (layout.mode.value !== "stack") {
        setLevel(to);
        return;
      }
      // Only this panel slides: it alone is named for the transition.
      const done = markSliding(layout.el);
      await withTransition(
        () => {
          setLevel(to);
        },
        { rootClass: to === "detail" ? "vt-pane-fwd" : "vt-pane-back" },
      ).finally(done);
    },
    [layout, level],
  );
  const go = useCallback((to: PaneLevel) => void show(to), [show]);
  return { level, go, show };
}

/** Name the element for a sliding transition; the returned function un-names it. */
function markSliding(el: HTMLElement | null): () => void {
  if (!el) return () => {};
  el.dataset.sliding = "true";
  return () => delete el.dataset.sliding;
}

function dragSplit(layout: PaneLayout, e: React.PointerEvent) {
  if (e.button !== 0) return;
  const split = e.currentTarget as HTMLElement;
  const grid = split.parentElement!;
  split.setPointerCapture(e.pointerId);
  const left = grid.getBoundingClientRect().left;
  const max = () => grid.clientWidth - 160;
  const move = (ev: PointerEvent) =>
    (layout.listWidth.value = Math.round(Math.max(100, Math.min(max(), ev.clientX - left))));
  const up = () => {
    split.removeEventListener("pointermove", move);
    split.removeEventListener("pointerup", up);
    layout.save();
  };
  split.addEventListener("pointermove", move);
  split.addEventListener("pointerup", up);
}

function resizeSplit(layout: PaneLayout, direction: -1 | 1) {
  const max = Math.max(100, (layout.el?.clientWidth ?? 260) - 160);
  layout.listWidth.value = Math.max(100, Math.min(max, layout.listWidth.value + direction * 10));
  layout.save();
}

export function TwoPane({
  layout,
  level,
  list,
  detail,
  title,
  backLabel,
  onBack,
  resizeLabel,
}: {
  layout: PaneLayout;
  level: PaneLevel;
  /** The list pane. */
  list: ReactNode;
  /** The detail pane, under its back bar. */
  detail: ReactNode;
  /** Named in the back bar. */
  title: string;
  backLabel: string;
  onBack: () => void;
  resizeLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mode = useQuery(layout.mode);
  const listWidth = useQuery(layout.listWidth);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => (layout.tooNarrow.value = el.clientWidth < SPLIT_MIN_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  return (
    <div className="panes-root" ref={rootRef}>
      <div
        className="panes"
        ref={(el) => layout.attach(el)}
        data-layout={mode}
        data-level={level}
        // Its own transition name, so two panels can slide at once.
        style={{
          "--list-w": `${listWidth}px`,
          "--pane-vt": `pane-${layout.key}`,
        }}
      >
        <div className="panes-list">{list}</div>
        <div
          className="panes-split"
          role="separator"
          aria-orientation="vertical"
          aria-label={resizeLabel}
          aria-valuemin={100}
          aria-valuemax={Math.max(100, (layout.el?.clientWidth ?? 260) - 160)}
          aria-valuenow={layout.listWidth.value}
          tabIndex={0}
          onPointerDown={(e) => dragSplit(layout, e)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            resizeSplit(layout, e.key === "ArrowLeft" ? -1 : 1);
          }}
          onDoubleClick={() => layout.resetWidth()}
        />
        <div className="panes-detail">
          <div className="panes-back panel-bar">
            <button
              type="button"
              className="panes-back-btn"
              aria-label={backLabel}
              onClick={onBack}
            >
              <IconBack />
            </button>
            <span className="panes-title">{title}</span>
          </div>
          {detail}
        </div>
      </div>
    </div>
  );
}
