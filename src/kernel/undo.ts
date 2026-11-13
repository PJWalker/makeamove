import type { UndoStack } from "../data/undo";
import { store } from "../lib/store";

/*
 * One undo history over several documents' stacks: the campaign's and the
 * open scene's. Undo reverts the most recent step in any of them, redo
 * replays the most recently undone, and a new step anywhere drops every
 * stack's redo, as one history would.
 */

export class UndoHistory {
  /** Which stack holds each undoable step, oldest first. */
  #undo: UndoStack[] = [];
  #redo: UndoStack[] = [];
  #stacks = new Set<UndoStack>();
  #replaying = false;
  /** The undo group of the last step recorded, so the next can join it. */
  #lastGroup: { stack: UndoStack; group: string } | null = null;
  readonly canUndo = store(false);
  readonly canRedo = store(false);

  /** Record a stack's steps in this history, until the returned function is called. */
  track(stack: UndoStack): () => void {
    const added = ({ type }: { type: "undo" | "redo" }) => {
      if (type === "redo") this.#redo.push(stack);
      else {
        this.#undo.push(stack);
        if (!this.#replaying) this.#dropRedo(stack);
      }
      this.#update();
    };
    const popped = ({ type }: { type: "undo" | "redo" }) => {
      removeLast(type === "undo" ? this.#undo : this.#redo, stack);
      this.#update();
    };
    const cleared = ({
      undoStackCleared,
      redoStackCleared,
    }: {
      undoStackCleared: boolean;
      redoStackCleared: boolean;
    }) => {
      if (undoStackCleared) this.#undo = this.#undo.filter((s) => s !== stack);
      if (redoStackCleared) this.#redo = this.#redo.filter((s) => s !== stack);
      this.#update();
    };
    this.#stacks.add(stack);
    stack.on("stack-item-added", added);
    stack.on("stack-item-popped", popped);
    stack.on("stack-cleared", cleared);
    return () => {
      stack.off("stack-item-added", added);
      stack.off("stack-item-popped", popped);
      stack.off("stack-cleared", cleared);
      this.#stacks.delete(stack);
      this.#undo = this.#undo.filter((s) => s !== stack);
      this.#redo = this.#redo.filter((s) => s !== stack);
      if (this.#lastGroup?.stack === stack) this.#lastGroup = null;
      this.#update();
    };
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
    this.#undo.at(-1)?.undo();
  }

  redo() {
    const stack = this.#redo.at(-1);
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
    for (const s of this.#stacks) if (s !== except) s.clear(false, true);
  }

  #update() {
    this.canUndo.value = this.#undo.length > 0;
    this.canRedo.value = this.#redo.length > 0;
  }
}

function removeLast<T>(list: T[], item: T) {
  const i = list.lastIndexOf(item);
  if (i >= 0) list.splice(i, 1);
}
