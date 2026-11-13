import { createContext, useContext, type ReactNode } from "react";
import StarterKit from "@tiptap/starter-kit";
import type { Node } from "@tiptap/pm/model";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import type { Campaign } from "../campaign/campaign";
import { TRACKER_NODE, type RichText, type TrackerButton } from "../data/richText";
import { getCharacter } from "../features/characters/api";
import { trackerBlock } from "../features/characters/trackers";
import { useQuery } from "../ui/useQuery";
import { shake, trackerButtonExtension, trackerTip } from "./trackerButtons";
import { pressTrackerButton } from "./commands/characters";
import { useCampaign, type CampaignContext } from "./campaignContext";

const RichTextContext = createContext<{
  campaign: Campaign;
  characterId: string | null;
  searchTerm: string;
} | null>(null);

type RichTextNode = Node;

function TextNode({ node }: { node: RichTextNode }) {
  const { searchTerm } = useContext(RichTextContext)!;
  return searchTerm ? <SearchHighlight text={node.text ?? ""} term={searchTerm} /> : node.text;
}

function HeadingNode({ children }: { children?: ReactNode }) {
  return <h4 className="formatted-heading">{children}</h4>;
}

function TrackerNode({ node }: { node: RichTextNode }) {
  const { campaign, characterId } = useContext(RichTextContext)!;
  return (
    <TrackerButtonView
      campaign={campaign}
      characterId={characterId}
      b={node.attrs as unknown as TrackerButton}
    />
  );
}

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
  const ctx = useCampaign();
  // Pressable or not follows the character's numbers as they change.
  const blocked = useQuery(campaign.characters, () => {
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
        if (blocked || !characterId || !ctx.execute(pressTrackerButton, { characterId, button: b }))
          shake(e.currentTarget);
      }}
    >
      {b.label}
    </button>
  );
}

/** What rules text can hold: StarterKit's formatting and tracker buttons. */
export const ruleTextExtensions = (ctx: CampaignContext) => [
  StarterKit.configure({ link: false }),
  trackerButtonExtension(ctx),
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
  const ctx = useCampaign();
  const rendered = renderToReactElement({
    extensions: ruleTextExtensions(ctx),
    content: text,
    options: {
      nodeMapping: {
        text: TextNode,
        heading: HeadingNode,
        [TRACKER_NODE]: TrackerNode,
      },
    },
  });
  return (
    <RichTextContext.Provider value={{ campaign, characterId, searchTerm }}>
      <div className={`formatted-text ${className}`}>{rendered}</div>
    </RichTextContext.Provider>
  );
}
