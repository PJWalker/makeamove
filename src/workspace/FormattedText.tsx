import type { ReactNode } from "react";
import type { Campaign } from "../campaign/campaign";
import { getCharacter } from "../features/characters/api";
import {
  parseTrackerButton,
  pressTracker,
  trackerBlock,
  type TrackerButton,
} from "../features/characters/trackers";
import { useY } from "../ui/useY";
import { shake, trackerTip } from "./trackerButtons";

/*
 * Read-only text with light formatting, for move descriptions: blank lines
 * part paragraphs, lines starting "- " are a list, "### " a heading, **bold**, *italic*, and
 * [[+1 XP]] buttons that change a character's numbers (see
 * features/characters/trackers).
 */

const INLINE = /(\[\[[^\]]+\]\])|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;

export function SearchHighlight({ text, term }: { text: string; term: string }) {
  if (!term) return text;
  return (
    <>
      {text.split(new RegExp(`(${RegExp.escape(term)})`, "ig")).map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="search-hit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A button in text, live for one character. */
export function TrackerButtonView({
  campaign,
  characterId,
  b,
}: {
  campaign: Campaign;
  characterId: string | null;
  b: TrackerButton;
}) {
  // Pressable or not follows the character's numbers as they change.
  const blocked = useY(campaign.characters, () => {
    void getCharacter(campaign, characterId ?? undefined);
    return trackerBlock(campaign, characterId, b);
  });
  return (
    <button
      type="button"
      className="tracker-button"
      aria-disabled={blocked ? true : undefined}
      data-tip={trackerTip(campaign, characterId, b)}
      onClick={(e) => {
        if (blocked || !characterId || !pressTracker(campaign, characterId, b))
          shake(e.currentTarget);
      }}
    >
      {b.label}
    </button>
  );
}

function inline(text: string, ctx: Ctx, key: string, searchTerm = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const highlight = (value: string, baseKey: string) =>
    searchTerm ? <SearchHighlight key={baseKey} text={value} term={searchTerm} /> : value;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(highlight(text.slice(last, m.index), `${key}.${n++}`));
    const k = `${key}.${n++}`;
    if (m[1]) {
      const b = parseTrackerButton(m[1]);
      out.push(
        b ? (
          <TrackerButtonView key={k} campaign={ctx.campaign} characterId={ctx.characterId} b={b} />
        ) : (
          m[1]
        ),
      );
    } else if (m[2]) out.push(<strong key={k}>{inline(m[2], ctx, k, searchTerm)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(m[3], ctx, k, searchTerm)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(highlight(text.slice(last), `${key}.${n++}`));
  return out;
}

interface Ctx {
  campaign: Campaign;
  /** Whose numbers the buttons change; null for nobody yet. */
  characterId: string | null;
}

export function FormattedText({
  campaign,
  text,
  characterId,
  className = "move-text",
  searchTerm = "",
}: {
  campaign: Campaign;
  text: string;
  /** Whose numbers its buttons change: null when no one is chosen. Required so buttons always render live. */
  characterId: string | null;
  className?: string;
  searchTerm?: string;
}) {
  const ctx: Ctx = { campaign, characterId };
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={`formatted-text ${className}`}>
      {blocks.flatMap((block, i) => {
        // Runs of list lines and of other lines, in order.
        const runs: { list: boolean; heading?: boolean; lines: string[] }[] = [];
        for (const line of block.split("\n")) {
          if (/^#{1,6}\s/.test(line.trim())) {
            runs.push({ list: false, heading: true, lines: [line.trim().replace(/^#+\s+/, "")] });
            continue;
          }
          const list = /^[-*•]\s/.test(line.trim());
          const run = runs.at(-1);
          if (run && !run.heading && run.list === list) run.lines.push(line);
          else runs.push({ list, lines: [line] });
        }
        return runs.map((run, r) =>
          run.heading ? (
            <h4 key={`${i}.${r}`} className="formatted-heading">
              {inline(run.lines[0]!, ctx, `${i}.${r}`, searchTerm)}
            </h4>
          ) : run.list ? (
            <ul key={`${i}.${r}`}>
              {run.lines.map((l, j) => (
                <li key={j}>
                  {inline(l.trim().replace(/^[-*•]\s+/, ""), ctx, `${i}.${r}.${j}`, searchTerm)}
                </li>
              ))}
            </ul>
          ) : (
            <p key={`${i}.${r}`}>
              {run.lines.flatMap((l, j) => [
                ...(j ? [<br key={`br${j}`} />] : []),
                ...inline(l, ctx, `${i}.${r}.${j}`, searchTerm),
              ])}
            </p>
          ),
        );
      })}
    </div>
  );
}
