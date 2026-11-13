import * as Y from "yjs";

/*
 * Undo stacks over whole documents. Only changes made in transactions tagged
 * with `origin` are recorded, so undo never reverts anyone else's edits.
 */

export type UndoStack = Y.UndoManager;

/**
 * An undo stack for a document's changes tagged with `origin`. Changes within
 * `mergeWithin` milliseconds join one step unless `stopCapturing()` comes first.
 */
export function undoStack(doc: Y.Doc, origin: object, mergeWithin = 0): UndoStack {
  return new Y.UndoManager(doc, { trackedOrigins: new Set([origin]), captureTimeout: mergeWithin });
}
