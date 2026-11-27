import type { LocalDoc as LocalDocument, LocalValue } from "../data/localDoc";
import { isObject, isString } from "../lib/guards";
import type { PieceKey } from "./dungeon";
import { STEPS } from "./steps";

/**
 * How far this device has got through the tutorial, kept in the campaign's
 * local document: the step it's on, and which scene element each of the
 * dungeon's pieces became. Null in a campaign that isn't a tutorial, or once
 * it's finished.
 */
export interface TutorialProgress {
  step: string;
  sceneId: string;
  pieces: Partial<Record<PieceKey, string>>;
}

function readProgress(stored: unknown): TutorialProgress | null {
  if (stored === undefined || stored === null) return null;
  if (!isObject<TutorialProgress>(stored) || !isString(stored.step) || !isString(stored.sceneId)) {
    console.warn("Ignoring stored tutorial progress: not progress", stored);
    return null;
  }
  const pieces = isObject<TutorialProgress["pieces"]>(stored.pieces) ? stored.pieces : {};
  // A step that's since been taken out starts the tutorial over.
  const step = STEPS.some((s) => s.id === stored.step) ? stored.step : STEPS[0]!.id;
  return { step, sceneId: stored.sceneId, pieces };
}

export const tutorialProgress = (local: LocalDocument): LocalValue<TutorialProgress | null> =>
  local.value("tutorial", readProgress);
