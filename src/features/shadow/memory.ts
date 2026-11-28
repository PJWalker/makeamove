import { newId } from "../../lib/ids";
import type { Line } from "./feed";
import type { Analysis, Briefing } from "./prompts";
import type { ShadowStore } from "./schema";

/*
 * Reading and writing the shadow's memory (schema.ts) as plain values.
 */

/** An open thread that hasn't come up in this many lines counts as forgotten. */
export const FORGOTTEN_AFTER = 60;
/** At most this many facts are kept per name; older ones drop off. */
const FACTS_PER_NAME = 12;
/** What's shown to the model, at most, of each list. */
const BRIEF = { names: 40, threads: 15, ideas: 6 };

const keyOf = (name: string) => name.trim().toLowerCase();

export interface FactView {
  id: string;
  name: string;
  facts: string[];
}
export interface ThreadView {
  id: string;
  title: string;
  resolved: boolean;
  forgotten: boolean;
}
export interface IdeaView {
  id: string;
  text: string;
  at: string;
}
export interface ShadowView {
  summary: string;
  ideas: IdeaView[];
  threads: ThreadView[];
  facts: FactView[];
  heard: Line[];
}

export function shadowView(s: ShadowStore): ShadowView {
  const read = s.shadowState.get("linesRead");
  return {
    summary: s.shadowState.get("summary"),
    ideas: s.shadowIdeas
      .entries()
      .filter(([, m]) => !m.get("dismissed"))
      .map(([id, m]) => ({ id, text: m.get("text"), at: m.get("at") }))
      .sort((a, b) => (a.at < b.at ? 1 : -1)),
    threads: s.shadowThreads
      .entries()
      .map(([id, m]) => ({
        id,
        title: m.get("title"),
        resolved: m.get("resolved"),
        forgotten: !m.get("resolved") && read - m.get("seenLine") >= FORGOTTEN_AFTER,
      }))
      .sort((a, b) => Number(b.forgotten) - Number(a.forgotten) || a.title.localeCompare(b.title)),
    facts: s.shadowFacts
      .entries()
      .map(([id, m]) => ({ id, name: m.get("name"), facts: m.get("facts") }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    heard: logLines(s, "", "voice"),
  };
}

/** What the shadow knows going in. */
export function briefing(s: ShadowStore): Briefing {
  const v = shadowView(s);
  return {
    summary: v.summary,
    names: v.facts.slice(0, BRIEF.names).map((f) => f.name),
    threads: v.threads
      .filter((t) => !t.resolved)
      .slice(0, BRIEF.threads)
      .map((t) => t.title),
    ideas: v.ideas.slice(0, BRIEF.ideas).map((i) => i.text),
  };
}

/** The non-chat lines after stamp `after`, of one source or all. */
export function logLines(s: ShadowStore, after: string, source?: "combat" | "voice"): Line[] {
  return s.shadowLog
    .values()
    .filter((m) => m.get("at") > after && (!source || m.get("source") === source))
    .map((m) => ({ at: m.get("at"), text: m.get("text") }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function addLogLine(s: ShadowStore, line: Line, source: "combat" | "voice") {
  s.shadowLog.set(newId(), { ...line, source });
}

/** Record that `lines` have been looked at, and what the model made of them. */
export function remember(s: ShadowStore, lines: Line[], a: Analysis) {
  const last = lines.at(-1);
  if (!last) return;
  s.shadowState.transact(() => {
    const read = s.shadowState.get("linesRead") + lines.length;
    s.shadowState.patch({ readThrough: last.at, linesRead: read });
    for (const text of a.ideas) s.shadowIdeas.set(newId(), { text, at: last.at });
    for (const f of a.facts) {
      const id = keyOf(f.name);
      const known = s.shadowFacts.get(id);
      const before = known?.get("facts") ?? [];
      const added = f.facts.filter((x) => !before.some((b) => keyOf(b) === keyOf(x)));
      const facts = [...before, ...added].slice(-FACTS_PER_NAME);
      if (known) known.patch({ facts });
      else s.shadowFacts.set(id, { name: f.name, facts });
    }
    for (const t of a.threads) {
      const id = keyOf(t.title);
      const known = s.shadowThreads.get(id);
      if (known) known.patch({ resolved: t.resolved, seenLine: read });
      else s.shadowThreads.set(id, { title: t.title, resolved: t.resolved, seenLine: read });
    }
  });
}

/** Mark lines through `through` as folded into `summary`, and drop the combat lines among them. */
export function folded(s: ShadowStore, summary: string, through: string) {
  s.shadowState.transact(() => {
    s.shadowState.patch({ summary, foldedThrough: through });
    for (const [id, m] of s.shadowLog.entries())
      if (m.get("source") === "combat" && m.get("at") <= through) s.shadowLog.delete(id);
  });
}

export function dismissIdea(s: ShadowStore, id: string) {
  s.shadowIdeas.get(id)?.patch({ dismissed: true });
}

export function setThreadResolved(s: ShadowStore, id: string, resolved: boolean) {
  s.shadowThreads.get(id)?.patch({ resolved, seenLine: s.shadowState.get("linesRead") });
}

export function forgetFact(s: ShadowStore, id: string) {
  s.shadowFacts.delete(id);
}

/** Forget everything: the summary, what it's heard, and what it's learned. */
export function forgetAll(s: ShadowStore) {
  s.shadowState.transact(() => {
    s.shadowState.patch({ summary: "", foldedThrough: "", readThrough: "", linesRead: 0 });
    s.shadowLog.clear();
    s.shadowFacts.clear();
    s.shadowThreads.clear();
    s.shadowIdeas.clear();
  });
}
