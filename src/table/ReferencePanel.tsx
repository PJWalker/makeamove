import { useSignal } from "@preact/signals-react";
import type { Campaign } from "../campaign/campaign";
import { systemOf } from "../features/characters/api";
import { useY } from "../ui/useY";
import { FormattedText } from "./FormattedText";

/**
 * The game system's reference text for the GM: agenda, principles, moves and
 * the like, searchable, each section folded until opened.
 */
export function ReferencePanel({ campaign }: { campaign: Campaign }) {
  const query = useSignal("");
  const gm = useY(campaign.members, () => campaign.isGm());
  const reference = systemOf(campaign).gmReference ?? [];
  if (!gm || !reference.length) return <p className="empty">No reference for this game.</p>;
  const needle = query.value.trim().toLowerCase();
  const sections = reference.filter((section) =>
    !needle || `${section.title}\n${section.text}`.toLowerCase().includes(needle),
  );
  return (
    <div className="panel-scroll reference">
      <input
        type="search"
        placeholder="Search the Reference…"
        aria-label="Search the Reference"
        value={query.value}
        onInput={(event) => (query.value = event.currentTarget.value)}
      />
      {sections.length ? (
        sections.map((section) => (
          <details key={section.id} className="reference-section" open={!!needle}>
            <summary>{section.title}</summary>
            <FormattedText campaign={campaign} text={section.text} className="reference-text" />
          </details>
        ))
      ) : (
        <p className="empty">Nothing matches “{query.value.trim()}”.</p>
      )}
    </div>
  );
}
