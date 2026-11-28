import { arrayOf, isBoolean, isNumber, isString, oneOf } from "../../lib/guards";
import { collection, lww, record } from "../../data/schema";
import type { Root } from "../../data/schema";

/*
 * What the GM shadow remembers. It lives in the GM vault (notes/vault.ts),
 * which is stored only on GM devices and syncs only between them, so none of
 * it can reach a player.
 *
 * Times are hybrid-logical-clock stamps, comparable with chat messages'.
 */

export const shadowShape = {
  shadowState: record({
    /** The story so far: everything before `foldedThrough`, summarised. */
    summary: lww(isString).or(""),
    /** The stamp of the last line folded into the summary. */
    foldedThrough: lww(isString).or(""),
    /** The stamp of the last line the shadow has looked at. */
    readThrough: lww(isString).or(""),
    /** How many lines it has looked at in all. */
    linesRead: lww(isNumber).or(0),
  }),
  /** Lines that aren't chat messages: the GM's speech, combat turns. */
  shadowLog: collection(
    record({
      at: lww(isString).or(""),
      text: lww(isString).or(""),
      source: lww(oneOf("voice", "combat")).or("voice"),
    }),
    "shadow log line",
  ),
  /** People, places and things by lower-cased name, with what's been learned about them. */
  shadowFacts: collection(
    record({
      name: lww(isString).or(""),
      facts: lww(arrayOf(isString)).or([]),
    }),
    "shadow fact",
  ),
  /** Plot threads by lower-cased title. */
  shadowThreads: collection(
    record({
      title: lww(isString).or(""),
      resolved: lww(isBoolean).or(false),
      /** `linesRead` when it last came up. */
      seenLine: lww(isNumber).or(0),
    }),
    "plot thread",
  ),
  /** Suggested complications, by id. */
  shadowIdeas: collection(
    record({
      text: lww(isString).or(""),
      at: lww(isString).or(""),
      dismissed: lww(isBoolean).or(false),
    }),
    "shadow idea",
  ),
};

export type ShadowStore = Root<typeof shadowShape>;
