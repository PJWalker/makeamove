import type { ComponentType } from "react";
import { canEdit } from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { DndNpcSheet, DndSheet } from "../systems/dnd55e/Sheet";
import { DungeonWorldNpcSheet, DungeonWorldSheet } from "../systems/dungeon-world/Sheet";
import { DungeonWorld2NpcSheet, DungeonWorld2Sheet } from "../systems/dungeon-world-2/Sheet";
import { BladesNpcSheet, BladesSheet } from "../systems/blades-in-the-dark/Sheet";
import type { GameSystem } from "../systems/types";
import { CopyBanner, TemplateSettings } from "./TemplateSettings";
import { DeclarativeSheet } from "./DeclarativeSheet";
import { RelationshipsSection } from "./Relationships";
import { CharacterText, GMCharacterText } from "./CharacterText";

/*
 * Built-in systems own their sheet components. Keep UI registration here
 * so importing a system's rules does not pull in its sheet or the table.
 */

type SheetProps = { campaign: Campaign; system: GameSystem; c: CharacterView };

const SHEETS: Record<string, { pc: ComponentType<SheetProps>; npc: ComponentType<SheetProps> }> = {
  "dnd-5.5e": { pc: DndSheet, npc: DndNpcSheet },
  "dungeon-world": { pc: DungeonWorldSheet, npc: DungeonWorldNpcSheet },
  "dungeon-world-2": { pc: DungeonWorld2Sheet, npc: DungeonWorld2NpcSheet },
  "blades-in-the-dark": { pc: BladesSheet, npc: BladesNpcSheet },
};

/** For systems with a layout: the core's declarative sheet. */
const declarative = (kind: "pc" | "npc") =>
  function Declarative(p: SheetProps) {
    return <DeclarativeSheet {...p} layout={p.system.sheet![kind]} />;
  };
const DECLARATIVE = { pc: declarative("pc"), npc: declarative("npc") };

/** A character's sheet, as their campaign's system draws it. */
export function CharacterSheet({ campaign, system, c }: SheetProps) {
  const sheets = SHEETS[system.id] ?? DECLARATIVE;
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
