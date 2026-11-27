import { stampTime } from "../../lib/hlc";
import { partStarts } from "./partStarts";

import type { ChatMessage, SystemMessage } from "./types";

/*
 * The log split at the GM's session markers, so earlier sessions can be
 * folded away. Each "Session N begins" marker starts a new part; a part
 * also holds the "ends" marker and anything after it until the next start.
 * Messages before the first marker form a part of their own.
 */

export interface SessionPart {
  /** The starting marker's id, or "before" for messages before the first one. */
  key: string;
  marker: SystemMessage | null;
  messages: ChatMessage[];
  /** The latest part, which is never folded. */
  current: boolean;
}

export const isSessionStart = (m: ChatMessage): m is SystemMessage =>
  m.kind === "system" && m.event === "session-start";

export function splitSessions(messages: ChatMessage[]): SessionPart[] {
  const starts = partStarts(messages.map((m) => isSessionStart(m)));
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? messages.length;
    const first = messages[start]!;
    const marker = isSessionStart(first) ? first : null;
    return {
      key: marker ? marker.id : "before",
      marker,
      messages: messages.slice(marker ? start + 1 : start, end),
      current: index === starts.length - 1,
    };
  });
}

/** Messages from one person within this long share a header. */
export const GROUP_MS = 5 * 60 * 1000;

/** One row of the chat log as shown: a message, or an earlier session's fold. */
export type LogRow =
  | { kind: "fold"; key: string; part: string; title: string; count: number; open: boolean }
  | { kind: "message"; key: string; m: ChatMessage; header: boolean };

/**
 * The log flattened into the rows it shows, so the panel can render just a
 * window of them. Earlier sessions are a fold, followed by their messages
 * when open; the current session shows its marker and everything after it.
 */
export function logRows(messages: ChatMessage[], isOpen: (part: string) => boolean): LogRow[] {
  const rows: LogRow[] = [];
  const add = (list: ChatMessage[]) => {
    for (const [index, m] of list.entries()) {
      const previous = list[index - 1];
      const header =
        m.kind !== "system" &&
        (!previous ||
          previous.kind === "system" ||
          previous.author !== m.author ||
          stampTime(m.hlc) - stampTime(previous.hlc) > GROUP_MS);
      rows.push({ kind: "message", key: m.id, m, header });
    }
  };
  for (const part of splitSessions(messages)) {
    if (part.current) {
      if (part.marker) add([part.marker]);
      add(part.messages);
      continue;
    }
    const open = isOpen(part.key);
    rows.push({
      kind: "fold",
      key: `fold:${part.key}`,
      part: part.key,
      title: part.marker
        ? `Session ${part.marker.session ?? ""}`.trim()
        : "Before the first session",
      count: part.messages.filter((m) => m.kind !== "system").length,
      open,
    });
    if (open) add(part.messages);
  }
  return rows;
}
