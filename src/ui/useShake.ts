import type * as React from "react";
import { useEffect, useRef } from "react";

export interface ShakeOptions {
  onShake: () => void;
  enabled: boolean;
  /** Leave presses on buttons and fields inside the element alone. */
  ignoreControls?: boolean;
  onTap?: (() => void) | undefined;
  /**
   * Called as the element is picked up, with the copy of it that follows the
   * pointer; returns what to do when it's put down.
   */
  onPickUp?: (element: HTMLElement, carrier: HTMLElement) => () => void;
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
  carrier.classList.add("shake-carrier");
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
    drop() {
      carrier.remove();
      element.style.opacity = opacity;
    },
  };
}

const REROLL_SPEED = 220;
const RELEASE_DECAY_MS = 60;

export function useShake({
  onShake,
  enabled,
  ignoreControls = false,
  onTap,
  onPickUp,
}: ShakeOptions) {
  const gesture = useRef<{
    pointer: number;
    originX: number;
    originY: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    distance: number;
    reversals: number;
    moved: boolean;
    time: number;
    vx: number;
    vy: number;
    grabbed: string | undefined;
    element: HTMLElement;
    carrier: HTMLElement;
    drop: () => void;
    cursor: string;
    putDown?: () => void;
  } | null>(null);
  const release = () => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    current.element.style.cursor = current.cursor;
    if (current.grabbed === undefined) delete current.element.dataset.grabbed;
    else current.element.dataset.grabbed = current.grabbed;
    current.putDown?.();
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
        (event.target as Element).closest(
          'button, input, textarea, select, a, [role="button"]',
        )
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
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
        distance: 0,
        reversals: 0,
        moved: false,
        time: event.timeStamp,
        vx: 0,
        vy: 0,
        grabbed: element.dataset.grabbed,
        element,
        carrier,
        drop,
        cursor: element.style.cursor,
      };
      element.dataset.grabbed = "true";
      element.style.cursor = "grabbing";
      const putDown = onPickUp?.(element, carrier);
      if (putDown) gesture.current.putDown = putDown;
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      const offsetX = event.clientX - current.originX;
      const offsetY = event.clientY - current.originY;
      current.carrier.style.translate = `${offsetX}px ${offsetY}px`;
      current.moved ||= Math.hypot(offsetX, offsetY) >= 6;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      const elapsed = Math.max(1, event.timeStamp - current.time);
      const dt = Math.max(16, elapsed);
      const smoothing = Math.min(1, Math.max(0.35, elapsed / 35));
      current.vx += ((dx * 1000) / dt - current.vx) * smoothing;
      current.vy += ((dy * 1000) / dt - current.vy) * smoothing;
      current.time = event.timeStamp;
      current.x = event.clientX;
      current.y = event.clientY;
      const distance = Math.hypot(dx, dy);
      if (distance < 6) return;
      if (dx * current.dx + dy * current.dy < 0) current.reversals++;
      current.distance += distance;
      current.dx = dx;
      current.dy = dy;
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      current.moved ||=
        Math.hypot(
          event.clientX - current.originX,
          event.clientY - current.originY,
        ) >= 6;
      const releaseAge = Math.max(0, event.timeStamp - current.time);
      const releaseSpeed =
        Math.hypot(current.vx, current.vy) *
        Math.exp(-releaseAge / RELEASE_DECAY_MS);
      release();
      event.stopPropagation();
      if (
        enabled &&
        (releaseSpeed >= REROLL_SPEED ||
          (current.reversals >= 2 && current.distance >= 70))
      )
        onShake();
      else if (enabled && !current.moved) onTap?.();
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
      else onShake();
    },
  };
}
