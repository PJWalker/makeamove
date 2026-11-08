import StarterKit from "@tiptap/starter-kit";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { Campaign } from "../campaign/campaign";
import { TRACKER_NODE, type RichText, type TrackerButton } from "../core/richText";
import { getCharacter } from "../features/characters/api";
import { pressTracker, trackerBlock } from "../features/characters/trackers";
import { useY } from "../ui/useY";
import { shake, trackerButtonExtension, trackerTip } from "./trackerButtons";

/*
 * Read-only rich text, for rules text (moves, outcomes, reference sections):
 * paragraphs, lists, headings, **bold**, *italic*, and [[+1 XP]] buttons that
 * change a character's numbers (see features/characters/trackers).
 */

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

/** What rules text can hold: StarterKit's formatting and tracker buttons. */
export const ruleTextExtensions = (campaign: Campaign) => [
  StarterKit.configure({ link: false }),
  trackerButtonExtension(campaign),
];

export function RichTextView({
  campaign,
  text,
  characterId,
  className = "move-text",
  searchTerm = "",
}: {
  campaign: Campaign;
  text: RichText;
  /** Whose numbers its buttons change: null when no one is chosen. Required so buttons always render live. */
  characterId: string | null;
  className?: string;
  searchTerm?: string;
}) {
  const rendered = renderToReactElement({
    extensions: ruleTextExtensions(campaign),
    content: text,
    options: {
      nodeMapping: {
        text: ({ node }) =>
          searchTerm ? <SearchHighlight text={node.text ?? ""} term={searchTerm} /> : node.text,
        heading: ({ children }) => <h4 className="formatted-heading">{children}</h4>,
        [TRACKER_NODE]: ({ node }) => (
          <TrackerButtonView
            campaign={campaign}
            characterId={characterId}
            b={node.attrs as TrackerButton}
          />
        ),
      },
    },
  });
  return <div className={`formatted-text ${className}`}>{rendered}</div>;
}
