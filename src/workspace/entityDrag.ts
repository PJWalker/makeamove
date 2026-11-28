import type { LinkKind } from "../features/notes/links";
import { dropLine, indexAmong } from "../ui/reorder";
import { followPress } from "../ui/pointer";
import suppressNextClick from "../ui/suppressClick";
import { hideTooltip } from "../ui/tooltipController";
import { reducedMotion } from "../ui/transition";
import type { CanvasState, TokenSpec } from "./canvasState";

const THRESHOLD = 5;

/**
 * Something dragged out of a list, the command palette, the hotbar or a
 * note's link, and the places it can land: pinned to the hotbar, given to a
 * character (gear and moves), or linked in a note.
 */
export interface DragEntity {
  label: string;
  /** Pin it to the hotbar at a position. */
  pin?: (index: number) => void;
  /** Link to it from a note. */
  link?: { kind: LinkKind; id: string };
  /** Give it to the character it's dropped on. */
  give?: {
    kind: "item" | "move";
    to: (characterId: string) => void;
    canGive?: (characterId: string) => boolean;
  };
  /** Place it on the map as a token; without one, a link goes down as a pin. */
  token?: TokenSpec;
  /** The Library entry it comes from, for drops that take rules entities (a struggle, a class). */
  libraryEntry?: { kind: string; id: string };
  /** File it in a note or character folder. */
  folder?: (folderId: string | undefined) => void;
}

export interface DropTarget {
  element: HTMLElement;
  characterId?: string;
  tokenId?: string;
  tokenCenter?: { x: number; y: number };
}

const entityDrops = new Map<
  Element,
  {
    accepts: (entity: DragEntity) => boolean;
    drop: (entity: DragEntity, x: number, y: number) => boolean | void;
  }
>();

export function registerEntityDrop(
  element: HTMLElement,
  accepts: (entity: DragEntity) => boolean,
  drop: (entity: DragEntity, x: number, y: number) => boolean | void,
) {
  entityDrops.set(element, { accepts, drop });
  return () => {
    entityDrops.delete(element);
  };
}

/** Editors that take a dropped entity as a link, by their element (marked `data-link-drop`). */
const linkDrops = new Map<
  Element,
  (link: { kind: LinkKind; id: string; label: string }, x: number, y: number) => boolean | void
>();

/** Let an editor take dropped entities as links; returns a function that stops it. */
export function registerLinkDrop(
  element: HTMLElement,
  insert: (
    link: { kind: LinkKind; id: string; label: string },
    x: number,
    y: number,
  ) => boolean | void,
) {
  element.dataset["linkDrop"] = "true";
  linkDrops.set(element, insert);
  return () => {
    delete element.dataset["linkDrop"];
    linkDrops.delete(element);
  };
}

const hotbar = () => document.querySelector<HTMLElement>(".hotbar");
const hotbarSlots = (except?: Element | null) =>
  [...(hotbar()?.querySelectorAll<HTMLElement>(".hotbar-slot") ?? [])].filter((s) => s !== except);

/** Whether a point is over the hotbar (with a little room above it). */
export function overHotbar(x: number, y: number) {
  const r = hotbar()?.getBoundingClientRect();
  return !!r && x >= r.left && x <= r.right && y >= r.top - 12 && y <= r.bottom;
}

/** The innermost element under a point that registered a drop accepting the entity. */
function registeredDropAt(element: Element | null, entity: DragEntity): HTMLElement | null {
  for (let at = element; at; at = at.parentElement)
    if (at instanceof HTMLElement && entityDrops.get(at)?.accepts(entity)) return at;
  return null;
}

/**
 * Where an entity would land at a point, other than the hotbar: an element
 * registered to take it, an editor that links it, or a character that takes
 * it (any element with `data-item-drop` or `data-move-drop` holding the
 * character's id).
 */
export function dropTargetAt(
  canvas: CanvasState,
  x: number,
  y: number,
  entity: DragEntity,
): DropTarget | null {
  const element = document.elementFromPoint(x, y);
  const registered = registeredDropAt(element, entity);
  if (registered) return { element: registered };
  const editor = element?.closest<HTMLElement>("[data-link-drop]");
  if (entity.link && editor && linkDrops.has(editor)) return { element: editor };
  const folder = entity.folder ? element?.closest<HTMLElement>("[data-folder-drop]") : null;
  if (folder) return { element: folder };
  if (entity.give) {
    const character = element?.closest<HTMLElement>(`[data-${entity.give.kind}-drop]`);
    if (character) {
      const characterId = character.dataset[entity.give.kind === "item" ? "itemDrop" : "moveDrop"];
      if (characterId) return { element: character, characterId };
    }
  }
  const scene = element?.closest<HTMLElement>(".scene-canvas");
  if (!scene || !canvas.tokenDrop.value) return null;
  const character = entity.give ? canvas.sceneCharacterAt.value?.(x, y) : null;
  if (character && !character.editable) return null;
  return {
    element: scene,
    ...(character
      ? {
          characterId: character.characterId,
          tokenId: character.tokenId,
          tokenCenter: character.center,
        }
      : {}),
  };
}

/** Put an entity down on the scene: as its token, or as a pin leading to it if it has no token of its own (pages, scenes). */
function dropOnScene(canvas: CanvasState, entity: DragEntity, { x, y }: { x: number; y: number }) {
  if (!entity.token && entity.link)
    return canvas.pinDrop.value?.(x, y, `${entity.link.kind}:${entity.link.id}`) ?? false;
  return canvas.tokenDrop.value?.(x, y, entity.token ?? { name: entity.label }) ?? false;
}

/** Drop an entity on a target from dropTargetAt; it flashes to say it landed. */
export function dropOn(
  canvas: CanvasState,
  target: DropTarget,
  entity: DragEntity,
  x: number,
  y: number,
) {
  if (!target.element.isConnected) return false;
  const registered = entityDrops.get(target.element);
  if (registered) {
    if (!registered.accepts(entity) || registered.drop(entity, x, y) === false) return false;
  } else {
    const link = linkDrops.get(target.element);
    if (link && entity.link) {
      if (link({ ...entity.link, label: entity.label }, x, y) === false) return false;
    } else if (entity.folder && Object.hasOwn(target.element.dataset, "folderDrop")) {
      entity.folder(target.element.dataset["folderDrop"] || undefined);
    } else if (entity.give && target.characterId) {
      const key = entity.give.kind === "item" ? "itemDrop" : "moveDrop";
      if (target.element.dataset[key] !== target.characterId) return false;
      if (entity.give.canGive && !entity.give.canGive(target.characterId)) return false;
      entity.give.to(target.characterId);
      if (target.tokenId) canvas.flashSceneDrop(target.tokenId);
    } else if (target.element.matches(".scene-canvas")) {
      if (!dropOnScene(canvas, entity, { x, y })) return false;
    } else return false;
  }
  target.element.dataset["dropped"] = "true";
  setTimeout(() => delete target.element.dataset["dropped"], 600);
  return true;
}

/** Marks the target under the pointer while dragging. */
export function dropMarker(canvas: CanvasState) {
  let target: DropTarget | null = null;
  return (next: DropTarget | null) => {
    if (next?.element === target?.element && next?.tokenId === target?.tokenId) return;
    delete target?.element.dataset["dropping"];
    target = next;
    canvas.sceneDropHighlight.value = next?.tokenId ?? null;
    if (target) target.element.dataset["dropping"] = "true";
  };
}

export function setDropCursor(valid: boolean | null) {
  if (valid === null) delete document.documentElement.dataset["dropValid"];
  else document.documentElement.dataset["dropValid"] = String(valid);
}

function sendGhostToToken(
  ghost: HTMLElement,
  center: { x: number; y: number },
  complete: () => void,
) {
  if (reducedMotion.matches) {
    ghost.remove();
    complete();
    return;
  }
  const box = ghost.getBoundingClientRect();
  ghost.style.transition =
    "left 180ms cubic-bezier(0.2, 0.8, 0.2, 1), top 180ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 180ms ease-in, opacity 180ms ease-in";
  ghost.style.left = `${center.x - box.width / 2}px`;
  ghost.style.top = `${center.y - box.height / 2}px`;
  ghost.style.transform = "scale(0.08)";
  ghost.style.opacity = "0";
  globalThis.setTimeout(() => {
    ghost.remove();
    complete();
  }, 180);
}

/**
 * Drag an entity from a row (or a link chip): a small copy of it follows
 * the pointer; over the hotbar a line shows where it would be pinned, and
 * other targets are marked. Releasing drops it there. A press that never
 * moves far is left alone, so it still clicks.
 */
export function dragEntity(
  canvas: CanvasState,
  e: PointerEvent | React.PointerEvent,
  entity: DragEntity,
  source = e.currentTarget as HTMLElement,
) {
  if (e.button !== 0) return;
  let ghost: HTMLElement;
  const mark = dropMarker(canvas);
  const line = dropLine("x");
  const onBar = (event: PointerEvent) => !!entity.pin && overHotbar(event.clientX, event.clientY);

  function lift() {
    // Just the name and icon, not the row's buttons or details.
    const pick = source.querySelector(".list-pick, .palette-title") ?? source;
    ghost = pick.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.className = "drag-ghost item-ghost";
    document.body.append(ghost);
    document.documentElement.classList.add("is-reordering");
    hideTooltip();
  }

  function move(event: PointerEvent) {
    // Beside the pointer, so it doesn't hide what it's over.
    ghost.style.left = `${event.clientX + 12}px`;
    ghost.style.top = `${event.clientY + 8}px`;
    const bar = hotbar();
    const onHotbar = onBar(event);
    let target: DropTarget | null = null;
    if (onHotbar) {
      if (bar) bar.dataset["dropping"] = "true";
      line.show(hotbarSlots(), indexAmong(hotbarSlots(), "x", event));
      mark(null);
    } else {
      if (bar) delete bar.dataset["dropping"];
      line.hide();
      target = dropTargetAt(canvas, event.clientX, event.clientY, entity);
      mark(target);
    }
    setDropCursor(onHotbar || !!target);
  }

  function end(event: PointerEvent, commit: boolean, lifted: boolean) {
    mark(null);
    line.hide();
    setDropCursor(null);
    canvas.sceneDropHighlight.value = null;
    const bar = hotbar();
    if (bar) delete bar.dataset["dropping"];
    if (!lifted) return;
    const target =
      commit && !onBar(event) ? dropTargetAt(canvas, event.clientX, event.clientY, entity) : null;
    document.documentElement.classList.remove("is-reordering");
    // The click that ends a drag is not a press on the row.
    suppressNextClick();
    if (!commit) {
      ghost.remove();
      return;
    }
    if (onBar(event)) {
      ghost.remove();
      entity.pin!(indexAmong(hotbarSlots(), "x", event));
      return;
    }
    if (target?.tokenId && target.tokenCenter && target.characterId && entity.give) {
      sendGhostToToken(ghost, target.tokenCenter, () =>
        dropOn(canvas, target, entity, event.clientX, event.clientY),
      );
      return;
    }
    ghost.remove();
    if (target) dropOn(canvas, target, entity, event.clientX, event.clientY);
  }

  followPress(e, THRESHOLD, { lift, move, end });
}
