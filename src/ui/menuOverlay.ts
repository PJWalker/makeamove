import { useEffectEvent, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { tether } from "./anchor";

/**
 * Keep an open menu (`ref`, styled `.drops-down`) tethered to the element it
 * drops from (`anchor`), and dismiss it on a press outside both.
 */
export function useMenuOverlay<T extends HTMLElement>({
  open,
  ref,
  anchor,
  onDismiss,
}: {
  open: boolean;
  ref: RefObject<T | null>;
  anchor: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  const dismiss = useEffectEvent(onDismiss);
  const isInside = useEffectEvent(
    (target: Node) => !!ref.current?.contains(target) || !!anchor.current?.contains(target),
  );

  useLayoutEffect(() => {
    if (!open || !ref.current || !anchor.current) return;
    return tether(ref.current, anchor.current);
  }, [open, ref, anchor]);

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
