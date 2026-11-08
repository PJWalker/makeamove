import type * as React from "react";
import { useEffect, useRef } from "react";

export interface ThrowOptions {
  /** Called when the element is let go at least THROW_DISTANCE from where it was picked up. */
  onThrow: () => void;
  enabled: boolean;
  /** Leave presses on buttons and fields inside the element alone. */
  ignoreControls?: boolean;
  onTap?: (() => void) | undefined;
  /**
   * Called as the carried copy goes THROW_DISTANCE or further from where it was
   * picked up; returns what to do when it comes back, or is let go.
   */
  onAway?: ((element: HTMLElement, carrier: HTMLElement) => () => void) | undefined;
}

/** Inherited text styles a lifted copy loses when it leaves its panel. */
const INHERITED = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
] as const;

/**
 * A copy of the element, over everything else on the page, that can be carried
 * outside the panel the element sits in. The element keeps its place, unseen.
 */
function lift(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  const computed = getComputedStyle(element);
  const carrier = element.cloneNode(true) as HTMLElement;
  carrier.removeAttribute("id");
  carrier.removeAttribute("tabindex");
  carrier.setAttribute("aria-hidden", "true");
  carrier.inert = true;
  carrier.classList.add("throw-carrier");
  // A cloned canvas comes up blank; copy what each one shows.
  const canvases = element.querySelectorAll("canvas");
  carrier.querySelectorAll("canvas").forEach((copy, index) => {
    const source = canvases[index]!;
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
  });
  for (const property of INHERITED)
    carrier.style.setProperty(property, computed.getPropertyValue(property));
  Object.assign(carrier.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  document.body.append(carrier);
  const opacity = element.style.opacity;
  element.style.opacity = "0";
  return {
    carrier,
    drop: () => {
      carrier.remove();
      element.style.opacity = opacity;
    },
  };
}

/** How far (CSS px) a picked-up element must be carried for letting go to throw it. */
const THROW_DISTANCE = 128;

export function useThrow({
  onThrow,
  enabled,
  ignoreControls = false,
  onTap,
  onAway,
}: ThrowOptions) {
  const gesture = useRef<{
    pointer: number;
    originX: number;
    originY: number;
    moved: boolean;
    grabbed: string | undefined;
    element: HTMLElement;
    carrier: HTMLElement;
    drop: () => void;
    cursor: string;
    /** Set while the copy is far enough away to throw: brings it back. */
    back?: (() => void) | undefined;
  } | null>(null);
  const release = () => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    current.element.style.cursor = current.cursor;
    if (current.grabbed === undefined) delete current.element.dataset.grabbed;
    else current.element.dataset.grabbed = current.grabbed;
    current.back?.();
    current.drop();
    return current;
  };
  useEffect(() => {
    const cancel = () => {
      release();
    };
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      release();
    };
  }, []);
  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (!enabled || event.button !== 0) return;
      if (
        ignoreControls &&
        (event.target as Element).closest('button, input, textarea, select, a, [role="button"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      release();
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
      const { carrier, drop } = lift(element);
      gesture.current = {
        pointer: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        moved: false,
        grabbed: element.dataset.grabbed,
        element,
        carrier,
        drop,
        cursor: element.style.cursor,
      };
      element.dataset.grabbed = "true";
      element.style.cursor = "grabbing";
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      const offsetX = event.clientX - current.originX;
      const offsetY = event.clientY - current.originY;
      current.carrier.style.translate = `${offsetX}px ${offsetY}px`;
      const distance = Math.hypot(offsetX, offsetY);
      current.moved ||= distance >= 6;
      const away = distance >= THROW_DISTANCE;
      if (away && !current.back)
        current.back = onAway?.(current.element, current.carrier) ?? (() => {});
      else if (!away && current.back) {
        current.back();
        current.back = undefined;
      }
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - current.originX, event.clientY - current.originY);
      release();
      event.stopPropagation();
      if (enabled && distance >= THROW_DISTANCE) onThrow();
      else if (enabled && !current.moved && distance < 6) onTap?.();
    },
    onPointerCancel() {
      release();
    },
    onLostPointerCapture() {
      release();
    },
    onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
      if (
        !enabled ||
        event.target !== event.currentTarget ||
        (event.key !== "Enter" && event.key !== " ")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (onTap) onTap();
      else onThrow();
    },
  };
}
