import { useLayoutEffect, useRef } from "react";
import { openPopup } from "../ui/popup";

export function usePopupDialog() {
  const reference = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => openPopup(reference.current), []);
  return reference;
}
