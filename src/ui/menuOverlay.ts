import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { placeAnchored, type Anchor } from "./anchor";

export function useMenuOverlay<T extends HTMLElement>({
  open,
  ref,
  anchor,
  onDismiss,
  inside = [],
  gap = 6,
  positionKey,
}: {
  open: boolean;
  ref: RefObject<T | null>;
  anchor: Anchor | null;
  onDismiss: () => void;
  inside?: (Node | null)[];
  gap?: number;
  positionKey?: unknown;
}) {
  const dismiss = useRef(onDismiss);
  const insideRefs = useRef(inside);
  dismiss.current = onDismiss;
  insideRefs.current = inside;

  useLayoutEffect(() => {
    if (!open || !ref.current || !anchor) return;
    placeAnchored(ref.current, anchor, gap);
  }, [open, ref, anchor?.left, anchor?.top, anchor?.bottom, gap, positionKey]);

  useLayoutEffect(() => {
    if (!open) return;
    const onOutside = (event: Event) => {
      const target = event.target as Node;
      if (
        ref.current?.contains(target) ||
        insideRefs.current.some((node) => node?.contains(target))
      )
        return;
      dismiss.current();
    };
    const onAway = () => dismiss.current();
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
