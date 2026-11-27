import { useEffect, useRef, useState } from "react";
import { plainText } from "../data/richText";
import type { ReferenceSectionDef } from "../systems/types";
import type { Campaign } from "../campaign/campaign";
import { actingCharacterId, systemOf } from "../features/characters/api";
import { List, ListRow } from "../ui/List";
import { TwoPane } from "../ui/TwoPane";
import { usePaneLevel } from "../ui/paneLevel";
import { useQuery } from "../ui/useQuery";
import { RichTextView, SearchHighlight } from "../workspace/RichTextView";
import { referenceLayout } from "./panelLayouts";

/**
 * The game system's reference text for the GM: agenda, principles, moves and
 * the like, searchable, each section folded until opened.
 */
export function ReferencePanel({ campaign }: { campaign: Campaign }) {
  const { gm, stacked, level, go, query, sections, selected, needle, search, select } =
    useReferencePanel(campaign);
  if (!gm || sections.length === 0) return <p className="empty">No reference for this game.</p>;

  return (
    <TwoPane
      layout={referenceLayout}
      level={level}
      title="Reference"
      backLabel="Back to the Reference"
      onBack={() => { go("list"); }}
      resizeLabel="Resize the Reference list"
      list={
        <nav className="panel-scroll reference-list" aria-label="GM Reference">
          <div className="panel-bar">
            <input
              type="search"
              placeholder="Search the Reference…"
              aria-label="Search the Reference"
              value={query}
              onChange={(event) => { search(event.currentTarget.value); }}
            />
          </div>
          {sections.length > 0 ? (
            <List>
              {sections.map((section) => (
                <ListRow
                  key={section.id}
                  name={section.title}
                  selected={section.id === selected?.id}
                  onPick={() => { select(section.id); }}
                />
              ))}
            </List>
          ) : (
            <p className="empty">Nothing matches “{query.trim()}”.</p>
          )}
        </nav>
      }
      detail={
        <>
          {stacked && (
            <div className="panel-bar">
              <input
                type="search"
                placeholder="Search the Reference…"
                aria-label="Search the Reference"
                value={query}
                onChange={(event) => { search(event.currentTarget.value); }}
              />
            </div>
          )}
          {selected ? (
            <ReferenceEntry campaign={campaign} section={selected} query={needle} />
          ) : (
            <div className="panel-scroll">
              <p className="empty">
                {needle ? `Nothing matches “${query.trim()}”.` : "Choose a reference entry."}
              </p>
            </div>
          )}
        </>
      }
    />
  );
}

function useReferencePanel(campaign: Campaign) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gm = useQuery(campaign.members, () => campaign.isGm());
  const reference = systemOf(campaign).gmReference ?? [];
  const stacked = useQuery(referenceLayout.mode) === "stack";
  const { level, go } = usePaneLevel(referenceLayout, "list");
  const needle = query.trim().toLowerCase();
  const sections = reference.filter(
    (section) =>
      !needle || `${section.title}\n${plainText(section.text)}`.toLowerCase().includes(needle),
  );
  const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
  const search = (value: string) => {
    setQuery(value);
    if (!value.trim()) go("list");
  };
  const select = (id: string) => {
    setSelectedId(id);
    go("detail");
  };

  return { gm, stacked, level, go, query, sections, selected, needle, search, select };
}

function ReferenceEntry({
  campaign,
  section,
  query,
}: {
  campaign: Campaign;
  section: ReferenceSectionDef;
  query: string;
}) {
  const entryReference = useRef<HTMLElement>(null);
  const characterId = useQuery(campaign.members, () => actingCharacterId(campaign)) ?? null;

  useEffect(() => {
    if (!query) return;
    entryReference.current?.querySelector(".search-hit")?.scrollIntoView({ block: "center" });
  }, [section.id, query]);

  return (
    <article ref={entryReference} className="panel-scroll reference-entry reference-section">
      <h2>
        <SearchHighlight text={section.title} term={query} />
      </h2>
      <RichTextView
        campaign={campaign}
        text={section.text}
        characterId={characterId}
        className="reference-text"
        searchTerm={query}
      />
    </article>
  );
}
