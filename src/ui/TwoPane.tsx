/* eslint-disable jsx-a11y/prefer-tag-over-role -- The panel's interactive splitter cannot be an hr. */
import type * as React from "react";
import type { ReadonlyStore, Store } from "../lib/store";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { IconBack } from "./icons";
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
const LIST_MIN_W = 100;
/** Room the detail keeps beside the list when the split is dragged. */
const DETAIL_MIN_W = 160;
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
  attach(element: HTMLElement | null): void;
  /** The layout switch for the panel's title bar. */
  Toggle: () => React.JSX.Element;
}

/** The widest the list may be in a panel this wide. */
const maxListWidth = (panelWidth: number) => Math.max(LIST_MIN_W, panelWidth - DETAIL_MIN_W);

const clampListWidth = (width: number, panelWidth: number) =>
  Math.max(LIST_MIN_W, Math.min(maxListWidth(panelWidth), width));

/** Drag the splitter between the list and the detail to set the list's width. */
function dragSplit(layout: PaneLayout, e: React.PointerEvent) {
  if (e.button !== 0) return;
  const split = e.currentTarget as HTMLElement;
  const grid = split.parentElement!;
  split.setPointerCapture(e.pointerId);
  const left = grid.getBoundingClientRect().left;
  const move = (event: PointerEvent) =>
    (layout.listWidth.value = Math.round(clampListWidth(event.clientX - left, grid.clientWidth)));
  const up = () => {
    split.removeEventListener("pointermove", move);
    split.removeEventListener("pointerup", up);
    layout.save();
  };
  split.addEventListener("pointermove", move);
  split.addEventListener("pointerup", up);
}

/** The panel's width, for limits on the list; a guess until it's on screen. */
const panelWidth = (layout: PaneLayout) => layout.el?.clientWidth ?? 260;

function resizeSplit(layout: PaneLayout, direction: -1 | 1) {
  layout.listWidth.value = clampListWidth(
    layout.listWidth.value + direction * 10,
    panelWidth(layout),
  );
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
  const rootReference = useRef<HTMLDivElement>(null);
  const mode = useQuery(layout.mode);
  const listWidth = useQuery(layout.listWidth);
  useEffect(() => {
    const element = rootReference.current;
    if (!element) return;
    const ro = new ResizeObserver(() => (layout.tooNarrow.value = element.clientWidth < SPLIT_MIN_W));
    ro.observe(element);
    return () => ro.disconnect();
  }, [layout]);

  return (
    <div className="panes-root" ref={rootReference}>
      <div
        className="panes"
        ref={(element) => layout.attach(element)}
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
          aria-valuemin={LIST_MIN_W}
          aria-valuemax={maxListWidth(panelWidth(layout))}
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
