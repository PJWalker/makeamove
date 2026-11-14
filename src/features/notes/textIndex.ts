import Fuse, { type FuseIndex, type IFuseOptions } from "fuse.js";
import { dataName } from "../../platform/dataEpoch";
import { deleteValue, readValue, writeValue } from "../../platform/keyval";
import { LINK_NODE } from "./links";

/*
 * Note search, on this device: each page's plain text with a prebuilt Fuse
 * index, stored on-device and never synced. It holds the text this device has
 * stored, which only changes while a page is open, so open pages keep their
 * entries current (NoteDoc reports each change). Each entry also maps text
 * offsets back to editor positions, so a match can be selected without
 * opening its page.
 */

/** A page as the editor serialises it (ProseMirror JSON). */
export type NoteNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | undefined;
  content?: NoteNode[] | undefined;
};

/**
 * Where a stretch of the text starts and the editor position it starts at:
 * a run of text counts up from there, a link chip's label all sits on the
 * chip, and a break between blocks has no position (-1).
 */
type Run = [offset: number, position: number, atom: 0 | 1];

interface IndexedPage {
  id: string;
  text: string;
  runs: Run[];
}

interface Stored {
  pages: IndexedPage[];
  index: ReturnType<FuseIndex<IndexedPage>["toJSON"]>;
}

export interface TextMatch {
  from: number;
  to: number;
  snippet: string;
}

const OPTIONS: IFuseOptions<IndexedPage> = {
  keys: ["text"],
  includeMatches: true,
  includeScore: true,
  findAllMatches: true,
  ignoreLocation: true,
  ignoreDiacritics: true,
  useTokenSearch: true,
  threshold: 0.3,
};
/** How long after the last change the index is written to the device. */
const SAVE_MS = 1000;
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** A page's plain text, and where in the editor each stretch of it is. */
export function flattenNote(root: NoteNode): { text: string; runs: Run[] } {
  let text = "";
  const runs: Run[] = [];
  const append = (value: string, position: number, atom: 0 | 1) => {
    if (!value) return;
    runs.push([text.length, position, atom]);
    text += value;
  };
  let textBlocks = 0;
  const walk = (node: NoteNode, position: number): number => {
    if (node.type === "text") {
      append(node.text ?? "", position, 0);
      return node.text?.length ?? 0;
    }
    if (node.type === LINK_NODE) {
      const label = node.attrs?.text || node.attrs?.label || node.attrs?.id;
      if (typeof label === "string") append(`@${label}`, position, 1);
      return 1;
    }
    if (node.type === "doc") {
      let next = position;
      for (const child of node.content ?? []) next += walk(child, next);
      return next - position;
    }
    if (node.type && TEXT_BLOCKS.has(node.type) && textBlocks++) append("\n", -1, 1);
    const children = node.content ?? [];
    if (!children.length) return 1;
    let next = position + 1;
    for (const child of children) next += walk(child, next);
    return next - position + 1;
  };
  walk(root, 0);
  return { text, runs };
}

/** The editor position of a character of the text, or -1 between blocks. */
function positionOf(runs: Run[], offset: number) {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (runs[mid]![0] <= offset) lo = mid;
    else hi = mid - 1;
  }
  const run = runs[lo];
  if (!run || run[1] < 0) return -1;
  return run[2] ? run[1] : run[1] + offset - run[0];
}

const WORD = /[\p{L}\p{N}'’]/u;

/** Widen a match to the words it falls in, since a near miss matches only some letters. */
function wholeWords(text: string, start: number, end: number): [number, number] {
  while (start > 0 && WORD.test(text[start - 1]!)) start--;
  while (end < text.length - 1 && WORD.test(text[end + 1]!)) end++;
  return [start, end];
}

/** Space or punctuation within a line, which a phrase's words may be split by. */
const BETWEEN_WORDS = /^[^\p{L}\p{N}\n]*$/u;

/**
 * Join word matches that sit next to each other in the text, since each word
 * of the query matches on its own, and put the longest (the most of the query)
 * first.
 */
function spans(text: string, ranges: [number, number][]) {
  const joined: [number, number][] = [];
  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0])) {
    const last = joined.at(-1);
    if (last && (start <= last[1] + 1 || BETWEEN_WORDS.test(text.slice(last[1] + 1, start))))
      last[1] = Math.max(last[1], end);
    else joined.push([start, end]);
  }
  return joined.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
}

function snippet(text: string, start: number, end: number) {
  const from = Math.max(0, start - 42);
  const to = Math.min(text.length, end + 42);
  return `${from ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ")}${to < text.length ? "…" : ""}`;
}

export class NoteTextIndex {
  private pages: Map<string, IndexedPage>;
  private fuse: Fuse<IndexedPage> | null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    private readonly key: string,
    stored: Stored | undefined,
  ) {
    this.pages = new Map(stored?.pages.map((p) => [p.id, p]));
    this.fuse = stored
      ? new Fuse(stored.pages, OPTIONS, Fuse.parseIndex<IndexedPage>(stored.index))
      : null;
  }

  static async load(campaignId: string) {
    const key = noteTextIndexKey(campaignId);
    let stored: Stored | undefined;
    try {
      stored = await readValue<Stored>(key);
    } catch {
      // Storage unavailable: build the index afresh, in memory.
    }
    return new NoteTextIndex(key, stored);
  }

  has(id: string) {
    return this.pages.has(id);
  }

  /** Record a page's text as this device now has it. */
  set(id: string, page: NoteNode) {
    const { text, runs } = flattenNote(page);
    if (this.pages.get(id)?.text === text) return;
    this.pages.set(id, { id, text, runs });
    this.changed();
  }

  delete(id: string) {
    if (this.pages.delete(id)) this.changed();
  }

  /** Drop pages this device no longer has. */
  keepOnly(ids: Set<string>) {
    for (const id of this.pages.keys()) if (!ids.has(id)) this.delete(id);
  }

  /** Pages whose text matches, best first, with where each match is. */
  search(query: string): { id: string; score: number; matches: TextMatch[] }[] {
    this.fuse ??= new Fuse([...this.pages.values()], OPTIONS);
    const shortest = Math.min(2, query.length);
    return this.fuse.search(query).map(({ item, score, matches }) => ({
      id: item.id,
      score: score ?? 1,
      matches: spans(
        item.text,
        (matches ?? []).flatMap(({ indices }) =>
          indices.flatMap(([start, end]) =>
            end - start + 1 >= shortest ? [wholeWords(item.text, start, end)] : [],
          ),
        ),
      ).flatMap(([start, end]) => {
        const from = positionOf(item.runs, start);
        const last = positionOf(item.runs, end);
        return from >= 0 && last >= 0
          ? [{ from, to: last + 1, snippet: snippet(item.text, start, end + 1) }]
          : [];
      }),
    }));
  }

  /** Write any change not yet stored. */
  flush() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const pages = [...this.pages.values()];
    const index = Fuse.createIndex(OPTIONS.keys!, pages);
    this.fuse = new Fuse(pages, OPTIONS, index);
    void writeValue(this.key, { pages, index: index.toJSON() } satisfies Stored).catch(() => {});
  }

  private changed() {
    this.fuse = null;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_MS);
  }
}

export const noteTextIndexKey = (campaignId: string) => dataName("noteText", campaignId);

/** Forget a campaign's index on this device. */
export const deleteNoteTextIndex = (campaignId: string) =>
  deleteValue(noteTextIndexKey(campaignId)).catch(() => {});
