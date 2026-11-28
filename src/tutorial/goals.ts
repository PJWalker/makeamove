import type { ToolId } from "../scene/tools";
import type { SceneElement } from "../scene/types";
import type { PieceKey } from "./dungeon";

/*
 * What a tutorial step asks the player to do, and how to tell they've done
 * it. A goal compares the table as the step began (`before`) with the table
 * now, so it notices the player's own action rather than what was already
 * there.
 */

/** The things the tutorial counts: each kind of scene element, chat messages, rolls and note pages. */
export type Tally = SceneElement["type"] | "message" | "note" | "roll";

export type Goal =
  /** Take one of something away. */
  | { kind: "fewer"; of: Tally }
  /** Lock one of the dungeon's pieces. */
  | { kind: "locked"; piece: PieceKey }
  /** Make one more of something. */
  | { kind: "more"; of: Tally }
  /** Move one of the dungeon's pieces. */
  | { kind: "moved"; piece: PieceKey }
  /** Open one of the dungeon's doors. */
  | { kind: "opened"; piece: PieceKey }
  /** Nothing to do: the player reads, then presses Next. */
  | { kind: "read" }
  /** Pick a tool. */
  | { kind: "tool"; tool: ToolId };

/** Where one of the dungeon's pieces is, whether it's locked, and whether it's open if it's a door. */
export interface PieceState {
  x: number;
  y: number;
  locked: boolean;
  open: boolean;
}

/**
 * The table as the tutorial sees it. A tally or piece that's missing isn't
 * known yet (the scene is still loading), which no goal counts as done.
 */
export interface World {
  tool: ToolId;
  tally: Partial<Record<Tally, number>>;
  pieces: Partial<Record<PieceKey, PieceState>>;
}

/** How to tell each kind of goal is done: `now` shows it done since `before`. */
const CHECKS: {
  [K in Goal["kind"]]: (goal: Extract<Goal, { kind: K }>, before: World, now: World) => boolean;
} = {
  read: () => false,
  tool: (goal, _before, now) => now.tool === goal.tool,
  more: (goal, before, now) =>
    compare(before.tally[goal.of], now.tally[goal.of], (was, is) => is > was),
  fewer: (goal, before, now) =>
    compare(before.tally[goal.of], now.tally[goal.of], (was, is) => is < was),
  moved: (goal, before, now) => {
    const was = before.pieces[goal.piece];
    const is = now.pieces[goal.piece];
    return was !== undefined && is !== undefined && (was.x !== is.x || was.y !== is.y);
  },
  locked: (goal, before, now) =>
    now.pieces[goal.piece]?.locked === true && before.pieces[goal.piece]?.locked !== true,
  opened: (goal, before, now) =>
    now.pieces[goal.piece]?.open === true && before.pieces[goal.piece]?.open !== true,
};

/** Compare two counts, if both are known. */
const compare = (
  was: number | undefined,
  is: number | undefined,
  test: (was: number, is: number) => boolean,
) => was !== undefined && is !== undefined && test(was, is);

/** Whether `now` shows the goal done since `before`. */
export const goalMet = (goal: Goal, before: World, now: World): boolean =>
  (CHECKS[goal.kind] as (goal: Goal, before: World, now: World) => boolean)(goal, before, now);

/**
 * The world a step started from, with whatever it didn't know yet (a scene
 * that hadn't loaded) filled in from `now`, the first time it's known.
 */
export function rebase(before: World, now: World): World {
  return {
    tool: before.tool,
    tally: { ...now.tally, ...before.tally },
    pieces: { ...now.pieces, ...before.pieces },
  };
}
