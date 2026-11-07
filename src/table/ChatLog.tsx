import { signal, useComputed, useSignal, useSignalEffect } from "@preact/signals-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { canDelete, canEditMessage, visibilityOf } from "../features/chat/types";
import { logRows, type LogRow } from "../features/chat/sessions";
import { markRead } from "../features/chat/unread";
import { toggleSetValue } from "../lib/set";
import { canEdit, getCharacter } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
import { IconDice, IconExpand } from "../ui/icons";
import { panelVisible } from "./panelLayout";
import { Message } from "./ChatMessage";

/* The chat log: every message and roll, rendered a window at a time. */

/** Earlier sessions the reader has opened, as "campaignId:key", for this visit. */
const openSessions = signal<Set<string>>(new Set());

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

/** The ids of the characters this device may change, as one string (so it compares by value). */
const editableIds = (campaign: Campaign) =>
  [...campaign.characters.keys()]
    .filter((id) => {
      const c = getCharacter(campaign, id);
      return !!c && canEdit(campaign, c);
    })
    .join(" ");

export function ChatLog({
  campaign,
  notes,
  onMenu,
}: {
  campaign: Campaign;
  notes: { id: number; text: string; error?: boolean }[];
  onMenu: (x: number, y: number, id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /** Following the newest message at the bottom. */
  const stick = useRef(true);
  const messages = campaign.chat.messages.value;
  const isGm = useY(campaign.members, () => campaign.isGm());
  const here = useY(campaign.members, () => campaign.activeSceneId());
  const sceneIds = useY(campaign.scenes, () => [...campaign.scenes.keys()].join());
  // One subscription for every move card's follow-up buttons, rather than one per card.
  const editable = useY(campaign.characters, () => editableIds(campaign));
  const me = device.value.id;
  // Messages already here when the panel opened don't animate in.
  const initial = useRef<Set<string> | null>(null);
  initial.current ??= new Set(messages.map((m) => m.id));

  // In view means read.
  const visible = useComputed(() => panelVisible("chat"));
  useSignalEffect(() => {
    void campaign.chat.messages.value;
    if (visible.value && document.hasFocus()) markRead();
  });
  useEffect(() => {
    window.addEventListener("focus", markRead);
    return () => window.removeEventListener("focus", markRead);
  }, []);

  const opened = openSessions.value;
  const rows = useMemo(
    () =>
      logRows(
        messages.filter((m) => visibilityOf(m, me, isGm) !== "hidden"),
        (key) => opened.has(`${campaign.id}:${key}`),
      ),
    [messages, me, isGm, opened, campaign],
  );
  const toggle = (key: string) => {
    const k = `${campaign.id}:${key}`;
    openSessions.value = toggleSetValue(openSessions.value, k);
  };

  // The window, as indices into rows.
  const span = useSignal<Span>({ start: null, end: null });
  const indexOf = (key: string | null) =>
    key === null ? -1 : rows.findIndex((r) => r.key === key);
  const endKeyAt = indexOf(span.value.end);
  const endIdx = span.value.end === null || endKeyAt < 0 ? rows.length : endKeyAt + 1;
  const startKeyAt = indexOf(span.value.start);
  const startIdx =
    span.value.start === null || startKeyAt < 0 || startKeyAt >= endIdx
      ? Math.max(0, endIdx - WINDOW)
      : startKeyAt;
  const atNewest = endIdx === rows.length;
  const shown = rows.slice(startIdx, endIdx);

  // Row heights (with the gap after them), measured as rows render; kept for this view.
  const heights = useRef(new Map<string, number>());
  const measured = heights.current;
  // Re-render once new rows are measured, so the spacers use the better average.
  const measuredCount = useSignal(0);
  void measuredCount.value;
  let total = 0;
  for (const h of measured.values()) total += h;
  const guess = measured.size ? total / measured.size : ROW_GUESS;
  const heightOf = (r: LogRow) => measured.get(r.key) ?? guess;
  const earlierCount = campaign.chat.earlierCount.value;
  const unloaded = earlierCount * guess;
  let above = unloaded;
  for (let i = 0; i < startIdx; i++) above += heightOf(rows[i]!);
  let below = 0;
  for (let i = endIdx; i < rows.length; i++) below += heightOf(rows[i]!);

  const setSpan = (from: number, to: number) => {
    const next = {
      start: rows[from]?.key ?? null,
      end: to >= rows.length ? null : rows[to - 1]!.key,
    };
    // Unchanged, it mustn't re-render: slide() runs after every render.
    if (next.start !== span.peek().start || next.end !== span.peek().end) span.value = next;
  };
  const loading = useSignal(false);
  // Read so finishing a load re-renders, and slide() can ask for the next chunk.
  void loading.value;
  const loadEarlier = () => {
    if (!campaign.chat.hasEarlier.peek() || loading.peek()) return;
    loading.value = true;
    void campaign.chat.loadEarlier().finally(() => (loading.value = false));
  };
  /** Set when the window moves to where the scrollbar was dragged: the spacers place it, so no anchoring. */
  const jumped = useRef(false);
  /** Render the rows around a point in the log, `y` px below the top of everything above the rows. */
  const jumpTo = (y: number) => {
    jumped.current = true;
    if (y < unloaded) {
      // Into chunks that aren't loaded: load the next one back; this runs again once it's in.
      setSpan(0, Math.min(rows.length, WINDOW));
      loadEarlier();
      return;
    }
    let i = 0;
    for (let acc = unloaded; i < rows.length - 1 && acc + heightOf(rows[i]!) <= y; i++)
      acc += heightOf(rows[i]!);
    const from = Math.max(0, i - JUMP_LEAD);
    setSpan(from, Math.min(rows.length, from + WINDOW));
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
        setSpan(from, Math.min(endIdx, from + MAX_ROWS));
      } else loadEarlier();
    } else if (rowsBottom - bottom < NEAR_PX && !atNewest) {
      const to = Math.min(rows.length, endIdx + STEP);
      setSpan(Math.max(startIdx, to - MAX_ROWS), to);
    } else if (stick.current && endIdx - startIdx > MAX_ROWS) {
      // Back at the newest after reading far up: let go of the old rows.
      span.value = { start: null, end: null };
    }
  };

  // Keep what's on screen where it is while rows come and go around it: note
  // where a row in view sits before rendering, and put it back after.
  const anchor = useRef<{ key: string; top: number } | null>(null);
  const el = ref.current;
  if (el && !stick.current && !jumped.current) {
    const { top, bottom } = el.getBoundingClientRect();
    // Only a row actually in view. Over a spacer there is none, and the scroll position stays put for slide() to fill.
    const row = [...(list.current?.children ?? [])].find((r) => {
      const box = r.getBoundingClientRect();
      return box.bottom > top && box.top < bottom;
    }) as HTMLElement | undefined;
    anchor.current = row?.dataset.key
      ? { key: row.dataset.key, top: row.getBoundingClientRect().top - top }
      : null;
  } else anchor.current = null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const row of list.current?.children ?? []) {
      const key = (row as HTMLElement).dataset.key;
      if (key) measured.set(key, (row as HTMLElement).offsetHeight + ROW_GAP);
    }
    if (measured.size !== measuredCount.peek()) measuredCount.value = measured.size;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (anchor.current) {
      const row = list.current?.querySelector<HTMLElement>(
        `[data-key="${CSS.escape(anchor.current.key)}"]`,
      );
      if (row)
        el.scrollTop +=
          row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.current.top;
    }
    jumped.current = false;
    // The window may still not reach far enough (a short window, rows just loaded, or a jump into unloaded chunks).
    slide();
  });

  // My own new message scrolls to the bottom even when I'd scrolled up.
  const newest = messages.at(-1);
  const seenNewest = useRef(newest?.id);
  useLayoutEffect(() => {
    if (newest?.id === seenNewest.current) return;
    seenNewest.current = newest?.id;
    if (newest?.author !== me) return;
    stick.current = true;
    span.value = { start: null, end: null };
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  // Rows change size after they render (dice settling, fonts, images): stay at the bottom.
  useEffect(() => {
    const el = ref.current;
    if (!el || !list.current) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(list.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="panel-scroll chat-log"
      role="log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = atNewest && el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        slide();
      }}
    >
      {rows.length === 0 && notes.length === 0 && (
        <div className="empty">
          <IconDice size={28} />
          Say hello, or roll some dice.
        </div>
      )}
      <div className="chat-space" style={{ height: `${Math.round(above)}px` }} aria-hidden="true" />
      <div ref={list} className="chat-rows">
        {shown.map((row) =>
          row.kind === "fold" ? (
            <button
              key={row.key}
              data-key={row.key}
              type="button"
              className="chat-session-fold"
              aria-expanded={row.open}
              onClick={() => toggle(row.part)}
            >
              <IconExpand size={22} className="chat-session-chevron" />
              <span className="chat-session-title">{row.title}</span>
              <span className="chat-session-count">
                {row.count} {row.count === 1 ? "message" : "messages"}
              </span>
            </button>
          ) : (
            <Message
              key={row.key}
              campaign={campaign}
              m={row.m}
              header={row.header}
              fresh={!initial.current!.has(row.m.id)}
              masked={visibilityOf(row.m, me, isGm) === "masked"}
              mine={row.m.author === me}
              canAct={row.m.kind === "move" && editable.split(" ").includes(row.m.characterId)}
              canGo={
                row.m.kind === "system" &&
                row.m.event === "scene-change" &&
                !!row.m.sceneId &&
                row.m.sceneId !== here &&
                sceneIds.includes(row.m.sceneId)
              }
              onMenu={
                canDelete(row.m, me, isGm) ||
                canEditMessage(row.m, me) ||
                (isGm && row.m.kind !== "system")
                  ? onMenu
                  : undefined
              }
            />
          ),
        )}
      </div>
      <div className="chat-space" style={{ height: `${Math.round(below)}px` }} aria-hidden="true" />
      {atNewest &&
        notes.map((n) => (
          <p key={n.id} className="chat-note" data-error={n.error}>
            {n.text}
          </p>
        ))}
    </div>
  );
}
