import { store } from "../lib/store";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canDelete, canEditMessage, visibilityOf } from "../features/chat/types";
import { logRows, type LogRow } from "../features/chat/sessions";
import { markRead } from "../features/chat/unread";
import { toggleSetValue } from "../lib/set";
import { canEdit, getCharacter } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
import { IconDice, IconExpand } from "../ui/icons";
import { usePanelVisible } from "./panelLayout";
import { Message } from "./ChatMessage";
import { useValue } from "../ui/useValue";

/* The chat log: every message and roll, rendered a window at a time. */

/** Earlier sessions the reader has opened, as "campaignId:key", for this visit. */
const openSessions = store<Set<string>>(new Set());
const toggleSession = (key: string) => {
  openSessions.value = toggleSetValue(openSessions.value, key);
};

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
  const messages = useValue(campaign.chat.messages);
  const isGm = useY(campaign.members, () => campaign.isGm());
  const here = useY(campaign.members, () => campaign.activeSceneId());
  const sceneIds = useY(campaign.scenes, () => [...campaign.scenes.keys()].join());
  // One subscription for every move card's follow-up buttons, rather than one per card.
  const editable = useY(campaign.characters, () => editableIds(campaign));
  const me = useValue(device).id;
  // Messages already here when the panel opened don't animate in.
  const [initial] = useState(() => new Set(messages.map((m) => m.id)));

  // In view means read.
  const visible = usePanelVisible("chat");
  useEffect(() => {
    if (visible && document.hasFocus()) markRead();
  }, [messages, visible]);
  useEffect(() => {
    window.addEventListener("focus", markRead);
    return () => window.removeEventListener("focus", markRead);
  }, []);

  const opened = useValue(openSessions);
  const rows = useMemo(
    () =>
      logRows(
        messages.filter((m) => visibilityOf(m, me, isGm) !== "hidden"),
        (key) => opened.has(`${campaign.id}:${key}`),
      ),
    [messages, me, isGm, opened, campaign],
  );
  const toggle = (key: string) => toggleSession(`${campaign.id}:${key}`);

  // The window, as indices into rows.
  const [span, setSpanKeys] = useState<Span>({ start: null, end: null });
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
  const earlierCount = useValue(campaign.chat.earlierCount);
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
    if (next.start !== span.start || next.end !== span.end) setSpanKeys(next);
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
      setSpanKeys({ start: null, end: null });
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
  const newest = messages.at(-1);
  const [newestSeen, setNewestSeen] = useState(newest?.id);
  const myNewest = newest?.id !== newestSeen && newest?.author === me;
  if (newest?.id !== newestSeen) {
    setNewestSeen(newest?.id);
    if (myNewest) setSpanKeys({ start: null, end: null });
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

  return (
    <div
      ref={ref}
      className="panel-scroll chat-log"
      role="log"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = atNewest && el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        noteAnchor();
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
              fresh={!initial.has(row.m.id)}
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
