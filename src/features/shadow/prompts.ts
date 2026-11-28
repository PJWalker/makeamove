import { arrayOf, isBoolean, isObject, isString, objectOf } from "../../lib/guards";
import type { Line } from "./feed";

/*
 * What the shadow asks the on-device model, and how it reads the answers.
 * Each prompt carries everything it needs, so each runs in a fresh session
 * and the context never fills up with past turns.
 */

export const SYSTEM_PROMPT = `You are the GM's shadow: a quiet assistant to the game master of a tabletop roleplaying game. You read what happens at the table and help the GM run it. Only the GM sees what you write. Be brief and concrete. Never invent rules. Write in English.`;

/** What the shadow knows going in, kept short. */
export interface Briefing {
  summary: string;
  /** Known names, so it adds to them rather than starting new ones. */
  names: string[];
  /** Open plot threads. */
  threads: string[];
  /** Complications already suggested, so it doesn't repeat them. */
  ideas: string[];
}

const listed = (items: string[]) =>
  items.length > 0 ? items.map((s) => `- ${s}`).join("\n") : "(none)";
const transcript = (lines: Line[]) => lines.map((l) => l.text).join("\n");

/** `earlier` is recent context the shadow has already looked at; `fresh` is what's new. */
export function analysisPrompt(b: Briefing, earlier: Line[], fresh: Line[]): string {
  return `The story so far:
${b.summary || "(nothing yet)"}
${earlier.length > 0 ? `\nJust before that:\n${transcript(earlier)}\n` : ""}
Known people, places and things:
${listed(b.names)}

Open plot threads:
${listed(b.threads)}

Complications you've already suggested:
${listed(b.ideas)}

What just happened at the table:
${transcript(fresh)}

Reply with JSON:
- "ideas": up to 2 new complications the GM could introduce next, each one sentence, fitting what just happened.
- "facts": for each named non-player character, place or thing in what just happened, its "name" and new "facts" learned about it (short phrases). Use a known name's exact spelling.
- "threads": plot threads that came up in what just happened: "title" (a short phrase; reuse an open thread's exact title) and "resolved" (true if it was wrapped up).`;
}

export function foldPrompt(summary: string, lines: Line[]): string {
  return `The story so far:
${summary || "(nothing yet)"}

What happened next:
${transcript(lines)}

Rewrite the story so far to include what happened next, in at most 200 words. Keep names, promises, debts, secrets and unresolved questions. Reply with the summary only.`;
}

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    ideas: { type: "array", items: { type: "string" }, maxItems: 2 },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          facts: { type: "array", items: { type: "string" } },
        },
        required: ["name", "facts"],
      },
    },
    threads: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, resolved: { type: "boolean" } },
        required: ["title", "resolved"],
      },
    },
  },
  required: ["ideas", "facts", "threads"],
} as const;

export interface Analysis {
  ideas: string[];
  facts: { name: string; facts: string[] }[];
  threads: { title: string; resolved: boolean }[];
}

const isFact = objectOf({ name: isString, facts: arrayOf(isString) });
const isThread = objectOf({ title: isString, resolved: isBoolean });

const itemsOf = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);

/** The non-blank strings in `v`, trimmed. */
function phrases(v: unknown): string[] {
  const out: string[] = [];
  for (const s of itemsOf(v)) if (isString(s) && s.trim()) out.push(s.trim());
  return out;
}

/** The model's answer, keeping what's well formed and dropping the rest. */
export function readAnalysis(reply: string): Analysis {
  const a: Analysis = { ideas: [], facts: [], threads: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    return a;
  }
  const o = isObject<Record<string, unknown>>(parsed) ? parsed : {};
  a.ideas = phrases(o["ideas"]);
  for (const f of itemsOf(o["facts"])) {
    if (!isFact(f)) continue;
    const facts = phrases(f.facts);
    if (f.name.trim() && facts.length > 0) a.facts.push({ name: f.name.trim(), facts });
  }
  for (const t of itemsOf(o["threads"]))
    if (isThread(t) && t.title.trim())
      a.threads.push({ title: t.title.trim(), resolved: t.resolved });
  return a;
}
