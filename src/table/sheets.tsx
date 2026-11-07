import { canEdit } from "../features/characters/api";
import { extensionOf, type SheetProps } from "../systems/extensions";
import { CopyBanner, TemplateSettings } from "./TemplateSettings";
import { DeclarativeSheet } from "./DeclarativeSheet";
import { RelationshipsSection } from "./Relationships";
import { CharacterText, GMCharacterText } from "./CharacterText";

/** For systems with a layout: the core's declarative sheet. */
const declarative = (kind: "pc" | "npc") =>
  function Declarative(p: SheetProps) {
    return <DeclarativeSheet {...p} layout={p.system.sheet![kind]} />;
  };
const DECLARATIVE = { pc: declarative("pc"), npc: declarative("npc") };

/** A character's sheet, as their campaign's system draws it. */
export function CharacterSheet({ campaign, system, c }: SheetProps) {
  const sheets = extensionOf(system).sheets ?? DECLARATIVE;
  const Sheet = c.kind === "npc" ? sheets.npc : sheets.pc;
  const editable = canEdit(campaign, c);
  return (
    <div
      className="character-sheet-drop"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      {c.base && <CopyBanner campaign={campaign} c={c} />}
      <Sheet key={c.id} campaign={campaign} system={system} c={c} />
      <section className="form-section sheet-section" aria-label="Character notes">
        <h3 className="sheet-heading">Notes</h3>
        <CharacterText
          campaign={campaign}
          c={c}
          field="description"
          label="Description"
          editable={editable}
        />
        {campaign.isGm() && (
          <GMCharacterText campaign={campaign} c={c} field="gm-notes" label="GM Notes" editable />
        )}
      </section>
      <RelationshipsSection key={`rel-${c.id}`} campaign={campaign} c={c} />
      {c.kind === "npc" && !c.base && <TemplateSettings campaign={campaign} c={c} />}
    </div>
  );
}
