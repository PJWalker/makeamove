import { createElement, type PointerEvent as ReactPointerEvent } from "react";
import { derived, store, type ReadonlyStore } from "../lib/store";
import { IconLayoutSingle, IconLayoutSplit } from "./icons";
import { getStorageJson, setStorageJson } from "../platform/localStorage";
import { useQuery } from "./useQuery";
import type { PaneLayout, PaneLayoutMode } from "./TwoPane";

const DEFAULT_LIST_W = 200;

function PaneToggle({
  mode,
  tooNarrow,
  names,
  onToggle,
}: {
  mode: ReadonlyStore<PaneLayoutMode>;
  tooNarrow: ReadonlyStore<boolean>;
  names: { list: string; detail: string };
  onToggle: () => void;
}) {
  const split = useQuery(mode) === "split";
  const narrow = useQuery(tooNarrow);
  const label = narrow
    ? `One at a time (widen the panel to see the ${names.list} and ${names.detail} side by side)`
    : split
      ? "Side by side: click to show one at a time"
      : `One at a time: click to show the ${names.list} and ${names.detail} side by side`;
  return createElement(
    "button",
    {
      type: "button",
      className: "pane-toggle",
      "aria-label": label,
      title: label,
      "aria-pressed": split,
      disabled: narrow,
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => event.stopPropagation(),
      onClick: onToggle,
    },
    createElement(split ? IconLayoutSplit : IconLayoutSingle, { size: 22 }),
  );
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

  const Toggle = () =>
    createElement(PaneToggle, {
      mode,
      tooNarrow,
      names,
      onToggle: () => {
        chosen.value = mode.value === "split" ? "stack" : "split";
        save();
      },
    });

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
