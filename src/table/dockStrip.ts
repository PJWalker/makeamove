import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import { useCampaign } from "../workspace/campaignContext";
import { useQuery } from "../ui/useQuery";

interface Measurement {
  width: number;
  elements: HTMLElement[];
}

export function measureRow(row: HTMLElement): Measurement {
  const elements = [...row.children] as HTMLElement[];
  const style = getComputedStyle(row);
  const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const gaps = Math.max(0, elements.length - 1) * (Number.parseFloat(style.columnGap) || 0);
  return {
    width: elements.reduce((width, element) => width + element.offsetWidth, 0) + padding + gaps,
    elements,
  };
}

export function useDockStripLayout(
  reference: RefObject<HTMLDivElement | null>,
  edge: "bottom" | "top",
  measureContent: (bar: HTMLElement) => Measurement = measureRow,
) {
  const context = useCampaign();
  const insets = useQuery(context.panels.dockInsets);
  useLayoutEffect(() => {
    const barElement = reference.current;
    const table = barElement?.closest<HTMLElement>(".table");
    if (!barElement || !table) return;
    const bar = barElement;
    const heightProperty = `--dock-${edge}-height`;
    const measure = () => {
      const available = table.clientWidth - insets.left.body - insets.right.body;
      // The measured DOM is intentionally updated by this layout effect.
      // eslint-disable-next-line react-hooks/immutability
      bar.dataset["fullWidth"] = String(measureContent(bar).width > available);
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
