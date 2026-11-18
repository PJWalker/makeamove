import type { PointerEvent as ReactPointerEvent } from "react";
import { followPress } from "../ui/pointer";
import { suppressNextClick } from "../ui/suppressClick";
import type { CanvasState, TokenSpec } from "./canvasState";

const THRESHOLD = 5;

/**
 * Drag a stand-in token (the pressed element) onto the map. A copy follows
 * the pointer; releasing over the scene places a token for the character.
 * A press that never travels stays an ordinary click.
 */
export function dragToken(
  canvas: CanvasState,
  e: PointerEvent | ReactPointerEvent,
  spec: TokenSpec,
) {
  if (e.button !== 0) return;
  const src = e.currentTarget as HTMLElement;
  const box = src.getBoundingClientRect();
  let ghost: HTMLElement;
  const overScene = (ev: PointerEvent) =>
    !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".scene-canvas");

  followPress(e, THRESHOLD, {
    lift() {
      ghost = src.cloneNode(true) as HTMLElement;
      ghost.classList.add("drag-ghost");
      ghost.style.width = `${box.width}px`;
      ghost.style.height = `${box.height}px`;
      document.body.appendChild(ghost);
      document.documentElement.classList.add("is-reordering");
    },
    move(ev) {
      document.documentElement.dataset["dropValid"] = String(
        overScene(ev) && !!canvas.tokenDrop.value,
      );
      ghost.style.left = `${ev.clientX - box.width / 2}px`;
      ghost.style.top = `${ev.clientY - box.height / 2}px`;
    },
    end(ev, commit, lifted) {
      delete document.documentElement.dataset["dropValid"];
      if (!lifted) return;
      ghost.remove();
      document.documentElement.classList.remove("is-reordering");
      suppressNextClick();
      if (commit && overScene(ev)) canvas.tokenDrop.value?.(ev.clientX, ev.clientY, spec);
    },
  });
}
