import { arrayOf, isNumber, isString } from "../../data/guards";
import { lww, record, subdoc } from "../../data/schema";
import type { LinkRef } from "./links";

/*
 * A page's entry in a notes index, kept in the campaign root (or the GM
 * vault) so lists and backlinks need no page loaded. Its text is `doc`, a
 * subdocument of its own (noteDoc.ts).
 */
export const noteEntry = record({
  title: lww(isString).or(""),
  folder: lww(isString),
  order: lww(isString).or("a0"),
  /** What the page links to. */
  links: lww(arrayOf(isString) as (v: unknown) => v is LinkRef[]).or([]),
  updatedAt: lww(isNumber).or(0),
  updatedBy: lww(isString),
  /** The session a session page is for (sessions.ts). */
  session: lww(isNumber),
  doc: subdoc(),
});

/** A notes folder. */
export interface NoteFolder {
  name: string;
  order: string;
}
