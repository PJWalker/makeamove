import { messageText } from "../chat/content";
import { shadowReadsMessage } from "../chat/types";
import type { ChatMessage, MoveMessage, RollMessage, TextMessage } from "../chat/types";
import { plainText } from "../../data/richText";

/*
 * The session as the shadow reads it: one short line of plain text per
 * event, in stamp order. Chat messages the GM can't see (whispers between
 * players) are left out (chat/audience.ts proves `shadowReads`).
 */

export interface Line {
  /** Hybrid-logical-clock stamp. */
  at: string;
  text: string;
}

/** Long messages are cut, so one can't crowd out the rest of the window. */
const MAX_LINE = 400;

const clip = (s: string) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1)}…` : s);

const said = (m: TextMessage) => {
  const text = messageText(m.text);
  if (!text) return null;
  const to = m.toNames?.length ? ` (whispering to ${m.toNames.join(", ")})` : "";
  return m.emote ? `${m.name}${to} ${text}` : `${m.name}${to}: ${text}`;
};

const rolled = (m: RollMessage) => {
  const secret = m.visibility === "private" ? " in secret" : "";
  const why = m.comment ? ` for ${m.comment}` : "";
  return `${m.name} rolled ${m.roll.formula}${why}${secret}: ${String(m.roll.total)}`;
};

const moved = (m: MoveMessage) => {
  const roll = m.roll ? ` (rolled ${String(m.roll.total)})` : "";
  const result = m.result ? `, ${m.result}` : "";
  const outcome = plainText(m.outcome).trim();
  return `${m.characterName} made the move ${m.moveName}${roll}${result}${outcome ? `: ${outcome}` : ""}`;
};

/** A chat message as one line for the shadow, or null if it has nothing for it. */
function lineText(m: ChatMessage): string | null {
  if (m.kind === "text") return said(m);
  if (m.kind === "roll") return rolled(m);
  if (m.kind === "move") return moved(m);
  if (m.kind === "system") return m.event === "join" ? null : m.text;
  return `${m.name} started a ${m.kind === "timer" ? "timer" : "count"}: ${m.label}`;
}

/** What the GM `gm` would want the shadow to read of `messages`, after stamp `after`. */
export function chatLines(messages: readonly ChatMessage[], gm: string, after: string): Line[] {
  const lines: Line[] = [];
  for (const m of messages) {
    if (m.hlc <= after || !shadowReadsMessage(m, gm)) continue;
    const text = lineText(m);
    if (text) lines.push({ at: m.hlc, text: clip(text) });
  }
  return lines;
}

/** Lines from several sources, in stamp order. */
export const merged = (...sources: Line[][]): Line[] => sources.flat().sort(byStamp);

/** Stamps sort as plain strings (lib/hlc.ts). */
export function byStamp(a: Line, b: Line): number {
  if (a.at === b.at) return 0;
  return a.at < b.at ? -1 : 1;
}
