import type { PointerEvent as ReactPointerEvent } from "react";
import { followPress } from "../ui/pointer";
import suppressNextClick from "../ui/suppressClick";
import type { CanvasState, TokenSpec } from "./canvasState";

const THRESHOLD = 5;

/**
 * Drag a stand-in token (the pressed element) onto the map. A copy follows
 * the pointer; releasing over the scene places a token for the character.
 * A press that never travels stays an ordinary click.
 */
function dragToken(
  canvas: CanvasState,
  e: PointerEvent | ReactPointerEvent,
  spec: TokenSpec,
) {
  if (e.button !== 0) return;
  const source = e.currentTarget as HTMLElement;
  const box = source.getBoundingClientRect();
  let ghost: HTMLElement;
  const overScene = (event: PointerEvent) =>
    !!document.elementFromPoint(event.clientX, event.clientY)?.closest(".scene-canvas");

  followPress(e, THRESHOLD, {
    lift() {
      ghost = source.cloneNode(true) as HTMLElement;
      ghost.classList.add("drag-ghost");
      ghost.style.width = `${box.width}px`;
      ghost.style.height = `${box.height}px`;
      document.body.append(ghost);
      document.documentElement.classList.add("is-reordering");
    },
    move(event) {
      document.documentElement.dataset["dropValid"] = String(
        overScene(event) && !!canvas.tokenDrop.value,
      );
      ghost.style.left = `${event.clientX - box.width / 2}px`;
      ghost.style.top = `${event.clientY - box.height / 2}px`;
    },
    end(event, commit, lifted) {
      delete document.documentElement.dataset["dropValid"];
      if (!lifted) return;
      ghost.remove();
      document.documentElement.classList.remove("is-reordering");
      suppressNextClick();
      if (commit && overScene(event)) canvas.tokenDrop.value?.(event.clientX, event.clientY, spec);
    },
  });
}

export default dragToken;
