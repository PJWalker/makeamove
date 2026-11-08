import { useEffectEvent, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { placeAnchored } from "./anchor";

/**
 * Keep an open menu (`ref`) placed against the element it drops from
 * (`anchor`), and dismiss it on a press outside both.
 */
export function useMenuOverlay<T extends HTMLElement>({
  open,
  ref,
  anchor,
  onDismiss,
  gap = 6,
}: {
  open: boolean;
  ref: RefObject<T | null>;
  anchor: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  gap?: number;
}) {
  const dismiss = useEffectEvent(onDismiss);
  const isInside = useEffectEvent(
    (target: Node) => !!ref.current?.contains(target) || !!anchor.current?.contains(target),
  );

  // Every render, since what's in the menu (and so its size) may have changed.
  useLayoutEffect(() => {
    const box = anchor.current?.getBoundingClientRect();
    if (!open || !ref.current || !box) return;
    placeAnchored(ref.current, { left: box.left, top: box.top, bottom: box.bottom }, gap);
  });

  useLayoutEffect(() => {
    if (!open) return;
    const onOutside = (event: Event) => {
      if (!isInside(event.target as Node)) dismiss();
    };
    const onAway = () => dismiss();
    document.addEventListener("pointerdown", onOutside, true);
    window.addEventListener("wheel", onOutside, { passive: true });
    window.addEventListener("blur", onAway);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      window.removeEventListener("wheel", onOutside);
      window.removeEventListener("blur", onAway);
    };
  }, [open, ref]);
}
