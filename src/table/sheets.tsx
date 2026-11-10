import { canClaim, canEdit, claimCharacter, playerOf } from "../features/characters/api";
import type { CharacterView } from "../features/characters/types";
import type { Campaign } from "../campaign/campaign";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { extensionOf } from "../systems/extensions";
import type { SheetProps } from "../systems/extensionTypes";
import { CopyBanner, TemplateSettings } from "./TemplateSettings";
import { DeclarativeSheet } from "../workspace/DeclarativeSheet";
import { RelationshipsSection } from "./Relationships";
import { CharacterText, GMCharacterText } from "../workspace/CharacterText";

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
      <ClaimBanner campaign={campaign} c={c} />
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

/** Above a player character no one plays yet: a player's way to claim it (the GM's is the list's menu). */
function ClaimBanner({ campaign, c }: { campaign: Campaign; c: CharacterView }) {
  const open = useY(
    campaign.members,
    () => !campaign.isGm() && playerOf(campaign, c.id) === undefined && canClaim(campaign, c),
  );
  if (!open) return null;
  return (
    <div className="sheet-banner">
      <span>No one plays {c.name}.</span>
      <Button variant="ghost" onClick={() => claimCharacter(campaign, c.id)}>
        Play This Character
      </Button>
    </div>
  );
}
