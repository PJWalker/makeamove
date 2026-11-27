import { useEffect, useEffectEvent } from "react";
import { elementsFromClipboard } from "../scene/clipboard";
import type SceneController from "../scene/controller";
import isTyping from "../ui/keys";

/*
 * Copy, cut and paste on the scene. They come as the browser's own events,
 * rather than as key presses, so text fields, dialogs and text selected on
 * the page keep theirs.
 */

/** Whether a copy or paste belongs to something else: a field, a dialog, or text selected on the page. */
function belongsElsewhere(e: ClipboardEvent): boolean {
  const { target } = e;
  if (isTyping(target)) return true;
  if (target instanceof Element && target.closest("dialog")) return true;
  return e.type !== "paste" && (globalThis.getSelection()?.toString() ?? "") !== "";
}

/** Images on a paste, to import. */
const pastedImages = (data: DataTransfer) =>
  [...data.files].filter((f) => f.type.startsWith("image/"));

export default function useSceneClipboard(controller: SceneController | null) {
  const onCopy = useEffectEvent((e: ClipboardEvent) => {
    if (!controller || !e.clipboardData || belongsElsewhere(e)) return;
    const html = controller.copy(controller.selection.value, { cut: e.type === "cut" });
    if (!html) return;
    e.preventDefault();
    e.clipboardData.setData("text/html", html);
  });
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (!controller || !e.clipboardData || belongsElsewhere(e)) return;
    const copies = elementsFromClipboard(e.clipboardData.getData("text/html"));
    const images = pastedImages(e.clipboardData);
    if (!copies && images.length === 0) return;
    e.preventDefault();
    if (copies) controller.paste(copies);
    else void controller.importFiles(images, controller.centre());
  });
  useEffect(() => {
    const copy = (e: ClipboardEvent) => {
      onCopy(e);
    };
    const paste = (e: ClipboardEvent) => {
      onPaste(e);
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", copy);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", copy);
      document.removeEventListener("paste", paste);
    };
  }, []);
}
