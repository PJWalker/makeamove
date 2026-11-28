import type { UndoStack } from "../data/undo";
import { store } from "../lib/store";
import { added, cleared, popped } from "./steps";
import type { Steps } from "./steps";

/*
 * One undo history over several documents' stacks: the campaign's and the
 * open scene's. Undo reverts the most recent step in any of them, redo
 * replays the most recently undone, and a new step anywhere drops every
 * stack's redo, as one history would.
 */

export default class UndoHistory {
  /** Which stack (by id) holds each undoable and redoable step, oldest first. */
  #steps: Steps = { undo: [], redo: [] };
  /** The tracked stacks, by id. */
  readonly #stacks = new Map<string, UndoStack>();
  #nextId = 0;
  #replaying = false;
  /** The undo group of the last step recorded, so the next can join it. */
  #lastGroup: { stack: UndoStack; group: string } | null = null;
  readonly canUndo = store(false);
  readonly canRedo = store(false);

  /** Record a stack's steps in this history, until the returned function is called. */
  track(stack: UndoStack): () => void {
    const id = String(this.#nextId++);
    const onAdded = ({ type }: { type: "redo" | "undo" }) => {
      this.#steps = added(this.#steps, type, id);
      if (type === "undo" && !this.#replaying) this.#dropRedo(stack);
      this.#update();
    };
    const onPopped = ({ type }: { type: "redo" | "undo" }) => {
      this.#steps = popped(this.#steps, type, id);
      this.#update();
    };
    const onCleared = ({
      undoStackCleared,
      redoStackCleared,
    }: {
      undoStackCleared: boolean;
      redoStackCleared: boolean;
    }) => {
      this.#steps = cleared(this.#steps, id, { undo: undoStackCleared, redo: redoStackCleared });
      this.#update();
    };
    this.#stacks.set(id, stack);
    stack.on("stack-item-added", onAdded);
    stack.on("stack-item-popped", onPopped);
    stack.on("stack-cleared", onCleared);
    return () => {
      stack.off("stack-item-added", onAdded);
      stack.off("stack-item-popped", onPopped);
      stack.off("stack-cleared", onCleared);
      this.#stacks.delete(id);
      this.#steps = cleared(this.#steps, id, { undo: true, redo: true });
      if (this.#lastGroup?.stack === stack) this.#lastGroup = null;
      this.#update();
    };
  }

  /** The stack holding the latest step of a kind. */
  #latest(ids: string[]): UndoStack | undefined {
    const id = ids.at(-1);
    return id === undefined ? undefined : this.#stacks.get(id);
  }

  /**
   * About to record a step on `stack`: it joins the previous step only if
   * both share an undo group.
   */
  begin(stack: UndoStack, group: string | undefined) {
    if (!group || this.#lastGroup?.stack !== stack || this.#lastGroup.group !== group)
      stack.stopCapturing();
    this.#lastGroup = group ? { stack, group } : null;
  }

  undo() {
    this.#lastGroup = null;
    this.#latest(this.#steps.undo)?.undo();
  }

  redo() {
    const stack = this.#latest(this.#steps.redo);
    if (!stack) return;
    this.#lastGroup = null;
    this.#replaying = true;
    try {
      stack.redo();
    } finally {
      this.#replaying = false;
    }
  }

  #dropRedo(except: UndoStack) {
    for (const s of this.#stacks.values()) if (s !== except) s.clear(false, true);
  }

  #update() {
    this.canUndo.value = this.#steps.undo.length > 0;
    this.canRedo.value = this.#steps.redo.length > 0;
  }
}
