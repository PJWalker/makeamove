import { store } from "../../lib/store";
import type { MoveTarget } from "../chat/types";

/** What a move asks for before it rolls, given when it is started (see moves.ts). */
export interface MoveChoiceExtra {
  extra?: number | undefined;
}

/**
 * The move this device is making and still has to finish: one waiting for
 * targets on the scene, or for a stat or number before it rolls. One set
 * per open campaign; nothing here is shared or kept.
 */
export class MoveRequests {
  /** Asking for a stat or bond before a move rolls (see table/MovePrompt.tsx). */
  readonly ask = store<{
    moveId: string;
    characterId: string;
    targets?: MoveTarget[];
    choice?: MoveChoiceExtra;
  } | null>(null);

  /** A move waiting for its targets to be picked on the scene. */
  readonly targets = store<{ moveId: string; characterId: string } | null>(null);

  /** Drop whatever is waiting. */
  clear() {
    this.ask.value = null;
    this.targets.value = null;
  }
}
