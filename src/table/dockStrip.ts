import { useLayoutEffect, type RefObject } from "react";
import { useCampaign } from "../workspace/campaignContext";
import { useQuery } from "../ui/useQuery";

type Measurement = { width: number; elements: HTMLElement[] };

export function measureRow(row: HTMLElement): Measurement {
  const elements = [...row.children] as HTMLElement[];
  const style = getComputedStyle(row);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const gaps = Math.max(0, elements.length - 1) * (parseFloat(style.columnGap) || 0);
  return {
    width: elements.reduce((width, element) => width + element.offsetWidth, 0) + padding + gaps,
    elements,
  };
}

export function useDockStripLayout(
  ref: RefObject<HTMLDivElement | null>,
  edge: "top" | "bottom",
  measureContent: (bar: HTMLElement) => Measurement = measureRow,
) {
  const ctx = useCampaign();
  const insets = useQuery(ctx.panels.dockInsets);
  useLayoutEffect(() => {
    const bar = ref.current;
    const table = bar?.closest<HTMLElement>(".table");
    if (!bar || !table) return;
    const heightProperty = `--dock-${edge}-height`;
    const measure = () => {
      const available = table.clientWidth - insets.left.body - insets.right.body;
      bar.dataset.fullWidth = String(measureContent(bar).width > available);
      table.style.setProperty(heightProperty, `${bar.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [table, bar, ...measureContent(bar).elements]) observer.observe(element);
    return () => {
      observer.disconnect();
      table.style.removeProperty(heightProperty);
    };
  });
}
