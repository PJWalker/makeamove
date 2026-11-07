import type { WheelEvent } from "react";

/** Lets a mouse wheel scroll a strip that only scrolls sideways. */
export function scrollSideways(e: WheelEvent<HTMLElement>) {
  if (e.deltaY && !e.deltaX) e.currentTarget.scrollLeft += e.deltaY;
}
