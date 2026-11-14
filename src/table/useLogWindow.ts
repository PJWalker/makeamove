import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Campaign } from "../campaign/campaign";
import type { LogRow } from "../features/chat/sessions";
import type { ChatMessage } from "../features/chat/types";
import { useQuery } from "../ui/useQuery";

/*
 * A log can run to thousands of messages, so only a window of rows is
 * rendered: the newest WINDOW to begin with. Scrolling near either end of
 * what's rendered slides the window that way, a STEP at a time, trimming the
 * other end once it holds MAX_ROWS; reaching the oldest loaded message loads
 * the chunk before it. The window is kept by row keys, so rows arriving or
 * loading outside it don't move it.
 *
 * Spacers above and below stand in for the rows that aren't rendered, so the
 * scrollbar is sized to the whole history: rows that have been on screen
 * count at their measured height, others (and chunks not loaded yet) at the
 * average. Dragging the scrollbar past what's rendered moves the window to
 * where it lands, loading older chunks if that's where it is.
 */
const WINDOW = 100;
const STEP = 50;
const MAX_ROWS = 250;
/** How close to the end of what's rendered (in px) before more is rendered. */
const NEAR_PX = 800;
/** The space between rows (--space-1). */
const ROW_GAP = 4;
/** A row's height before it has been measured, until there's an average. */
const ROW_GUESS = 64;
/** Rows rendered above the one a jump lands on. */
const JUMP_LEAD = 20;

/** Where the window starts and ends: null means "WINDOW rows before the end" and "the newest row". */
type Span = { start: string | null; end: string | null };

/**
 * The window of a long chat log that's rendered, and the scroll behaviour around it: following the
 * newest message, keeping what's on screen in place as rows come and go, and sliding the window or
 * loading earlier chunks as the user scrolls. `settleOn` is whatever else can change a row's size.
 */
export function useLogWindow({
  campaign,
  rows,
  newest,
  me,
  settleOn: { editable, notes },
}: {
  campaign: Campaign;
  rows: LogRow[];
  newest: ChatMessage | undefined;
  me: string;
  settleOn: { editable: string; notes: unknown };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** Following the newest message at the bottom. */
  const stick = useRef(true);
  const earlierCount = useQuery(campaign.chat.earlierCount);

  // The window, as indices into rows.
  const [span, setSpan] = useState<Span>({ start: null, end: null });
  const indexOf = (key: string | null) =>
    key === null ? -1 : rows.findIndex((r) => r.key === key);
  const endKeyAt = indexOf(span.end);
  const endIdx = span.end === null || endKeyAt < 0 ? rows.length : endKeyAt + 1;
  const startKeyAt = indexOf(span.start);
  const startIdx =
    span.start === null || startKeyAt < 0 || startKeyAt >= endIdx
      ? Math.max(0, endIdx - WINDOW)
      : startKeyAt;
  const atNewest = endIdx === rows.length;
  const shown = rows.slice(startIdx, endIdx);

  // Row heights (with the gap after them), measured as rows render; kept for this view.
  const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map());
  let total = 0;
  for (const h of measured.values()) total += h;
  const guess = measured.size ? total / measured.size : ROW_GUESS;
  const heightOf = (r: LogRow) => measured.get(r.key) ?? guess;
  const unloaded = earlierCount * guess;
  let above = unloaded;
  for (let i = 0; i < startIdx; i++) above += heightOf(rows[i]!);
  let below = 0;
  for (let i = endIdx; i < rows.length; i++) below += heightOf(rows[i]!);

  const showRows = (from: number, to: number) => {
    const next = {
      start: rows[from]?.key ?? null,
      end: to >= rows.length ? null : rows[to - 1]!.key,
    };
    // Unchanged, it mustn't re-render: slide() runs after every render.
    if (next.start !== span.start || next.end !== span.end) setSpan(next);
  };
  const [loading, setLoading] = useState(false);
  // Read so finishing a load re-renders, and slide() can ask for the next chunk.
  void loading;
  const loadEarlier = () => {
    if (!campaign.chat.hasEarlier.value || loading) return;
    setLoading(true);
    void campaign.chat.loadEarlier().finally(() => setLoading(false));
  };
  /** Set when the window moves to where the scrollbar was dragged: the spacers place it, so no anchoring. */
  const jumped = useRef(false);
  /** Render the rows around a point in the log, `y` px below the top of everything above the rows. */
  const jumpTo = (y: number) => {
    jumped.current = true;
    if (y < unloaded) {
      // Into chunks that aren't loaded: load the next one back; this runs again once it's in.
      showRows(0, Math.min(rows.length, WINDOW));
      loadEarlier();
      return;
    }
    let i = 0;
    for (let acc = unloaded; i < rows.length - 1 && acc + heightOf(rows[i]!) <= y; i++)
      acc += heightOf(rows[i]!);
    const from = Math.max(0, i - JUMP_LEAD);
    showRows(from, Math.min(rows.length, from + WINDOW));
  };
  const slide = () => {
    const el = ref.current;
    const rowsEl = list.current;
    if (!el || !rowsEl) return;
    const box = el.getBoundingClientRect();
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    // Where the rendered rows are, in the log's scrolled content.
    const rowsTop = rowsEl.getBoundingClientRect().top - box.top + top;
    const rowsBottom = rowsTop + rowsEl.offsetHeight;
    const origin = rowsTop - above;
    if (bottom < rowsTop || top > rowsBottom) jumpTo(top - origin);
    else if (top - rowsTop < NEAR_PX && (startIdx > 0 || earlierCount > 0)) {
      if (startIdx > 0) {
        const from = Math.max(0, startIdx - STEP);
        showRows(from, Math.min(endIdx, from + MAX_ROWS));
      } else loadEarlier();
    } else if (rowsBottom - bottom < NEAR_PX && !atNewest) {
      const to = Math.min(rows.length, endIdx + STEP);
      showRows(Math.max(startIdx, to - MAX_ROWS), to);
    } else if (stick.current && endIdx - startIdx > MAX_ROWS) {
      // Back at the newest after reading far up: let go of the old rows.
      setSpan({ start: null, end: null });
    }
  };
  const slideRef = useRef(slide);
  useLayoutEffect(() => {
    slideRef.current = slide;
  });

  // Keep what's on screen where it is while rows come and go around it: note
  // where a row in view sits as things settle (after each render and scroll),
  // and put it back after the next render.
  const anchor = useRef<{ key: string; top: number } | null>(null);
  const noteAnchor = () => {
    const el = ref.current;
    if (!el || stick.current) {
      anchor.current = null;
      return;
    }
    const { top, bottom } = el.getBoundingClientRect();
    // Only a row actually in view. Over a spacer there is none, and the scroll position stays put for slide() to fill.
    const row = [...(list.current?.children ?? [])].find((r) => {
      const box = r.getBoundingClientRect();
      return box.bottom > top && box.top < bottom;
    }) as HTMLElement | undefined;
    anchor.current = row?.dataset.key
      ? { key: row.dataset.key, top: row.getBoundingClientRect().top - top }
      : null;
  };
  const noteAnchorRef = useRef(noteAnchor);
  useLayoutEffect(() => {
    noteAnchorRef.current = noteAnchor;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Re-render once rows are measured anew, so the spacers use the better average.
    let next: Map<string, number> | null = null;
    for (const row of list.current?.children ?? []) {
      const key = (row as HTMLElement).dataset.key;
      if (!key) continue;
      const height = (row as HTMLElement).offsetHeight + ROW_GAP;
      if (measured.get(key) === height) continue;
      next ??= new Map(measured);
      next.set(key, height);
    }
    if (next) setMeasured(next);
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (anchor.current && !jumped.current) {
      const row = list.current?.querySelector<HTMLElement>(
        `[data-key="${CSS.escape(anchor.current.key)}"]`,
      );
      if (row)
        el.scrollTop +=
          row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.current.top;
    }
    jumped.current = false;
    // The window may still not reach far enough (a short window, rows just loaded, or a jump into unloaded chunks).
    slideRef.current();
    noteAnchorRef.current();
  }, [measured, rows, startIdx, endIdx, earlierCount, loading, editable, notes]);

  // My own new message scrolls to the bottom even when I'd scrolled up.
  const [newestSeen, setNewestSeen] = useState(newest?.id);
  const myNewest = newest?.id !== newestSeen && newest?.author === me;
  if (newest?.id !== newestSeen) {
    setNewestSeen(newest?.id);
    if (myNewest) setSpan({ start: null, end: null });
  }
  const scrolledFor = useRef(newest?.id);
  useLayoutEffect(() => {
    if (newest?.id === scrolledFor.current) return;
    scrolledFor.current = newest?.id;
    if (newest?.author !== me) return;
    stick.current = true;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest?.id, newest?.author, me]);

  // Rows change size after they render (dice settling, fonts, images): stay at the bottom.
  useEffect(() => {
    const el = ref.current;
    if (!el || !list.current) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
      else noteAnchorRef.current();
    });
    ro.observe(list.current);
    return () => ro.disconnect();
  }, []);

  const onScroll = (e: { currentTarget: HTMLElement }) => {
    const el = e.currentTarget;
    stick.current = atNewest && el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    noteAnchor();
    slide();
  };
  return { ref, list, shown, above, below, atNewest, onScroll };
}
