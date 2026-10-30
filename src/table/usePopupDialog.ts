import { useLayoutEffect, useRef } from "preact/hooks";
import { openPopup } from "../ui/popup";

export function usePopupDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => openPopup(ref.current), []);
  return ref;
}
