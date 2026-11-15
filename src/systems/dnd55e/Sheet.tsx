import { canEdit } from "../../features/characters/api";
import { derive } from "../../features/characters/store";
import type { CharacterView } from "../../features/characters/types";
import type { Campaign } from "../../campaign/campaign";
import { device } from "../../platform/device";
import { CharacterText } from "../../workspace/CharacterText";
import { parseInputNumber } from "../../lib/number";
import { Inventory } from "../../workspace/Inventory";
import { SheetSectionView } from "../../workspace/DeclarativeSheet";
import { ActionsSection, NpcField, TextSection } from "../../workspace/sheetSections";
import { CharacterName, Counter, TokenChip } from "../../workspace/sheetParts";
import { signedStr } from "../../workspace/actionPresentation";
import type { Derived, GameSystem } from "../types";
import { useQuery } from "../../ui/useQuery";
import { bumpData, bumpResource, setData, setScore } from "../../workspace/commands/characters";
import { useCampaign } from "../../workspace/campaignContext";
import {
  CharacterDetails,
  CombatStats,
  ConditionsSection,
  DeathSaves,
  FeatsLine,
  LevelUp,
  ResourcePools,
  RestSection,
  SkillsSection,
  VitalsSection,
} from "./sections";
import { levelOf, num, useAction, valueOf } from "./sheetHooks";

/*
 * D&D 5.5e's character sheets, from the shared parts in workspace/sheetParts.tsx.
 * Every number that rolls is a button that makes its action, so advantage,
 * targets and the card work the same from the sheet, the hotbar and the palette.
 */

type Props = { campaign: Campaign; system: GameSystem; c: CharacterView };

function Name({
  campaign,
  c,
  editable,
  detail,
}: {
  campaign: Campaign;
  c: CharacterView;
  editable: boolean;
  detail: string;
}) {
  return (
    <header className="sheet-head">
      <TokenChip campaign={campaign} c={c} editable={editable} />
      <div className="sheet-title">
        <CharacterName c={c} editable={editable} />
        <span className="muted">{detail}</span>
      </div>
    </header>
  );
}

/** Ability scores, each with its check and saving throw. */
function Abilities({
  system,
  c,
  d,
  editable,
  use,
}: Props & { d: Derived; editable: boolean; use: (id: string) => void }) {
  const ctx = useCampaign();
  return (
    <ul className="sheet-stats dnd-abilities">
      {system.stats.map((s) => {
        const saveBonus = valueOf(d.values, `save:${s.id}`);
        const score = valueOf(d.values, s.id);
        const modifier = valueOf(d.mods, s.id);
        const prof = saveBonus > 0;
        return (
          <li key={s.id}>
            <span className="stat-abbr" title={s.name}>
              {s.abbr}
            </span>
            <button
              type="button"
              className="stat-mod"
              aria-label={`${s.name} check`}
              onClick={() => use(`check-${s.id}`)}
            >
              {signedStr(modifier)}
            </button>
            <input
              className="stat-score"
              type="number"
              min={1}
              max={30}
              aria-label={`${s.name} score`}
              title={score !== c.scores[s.id] ? `Effective ${score}` : undefined}
              value={c.scores[s.id]}
              disabled={!editable}
              onChange={(e) => {
                const value = parseInputNumber(e.currentTarget.value);
                if (value !== undefined && value >= 1 && value <= 30)
                  ctx.execute(setScore, { id: c.id, stat: s.id, score: value });
              }}
            />
            <button
              type="button"
              className="dnd-save"
              data-prof={prof}
              aria-label={`${s.name} save`}
              onClick={() => use(`save-${s.id}`)}
            >
              Save {signedStr(modifier + saveBonus)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Ability scores under a heading. */
function AbilitiesSection(
  props: Props & { d: Derived; editable: boolean; use: (id: string) => void },
) {
  return (
    <section className="form-section sheet-section" aria-label="Abilities">
      <h3 className="sheet-heading">Abilities</h3>
      <Abilities {...props} />
    </section>
  );
}

/** A player character's sheet. */
export function DndSheet({ campaign, system, c }: Props) {
  const d = derive(c, system);
  const editable = canEdit(campaign, c);
  const me = useQuery(device).id;
  const use = useAction({ system, c });
  const section = { campaign, system, c, d, editable };
  const classChoice = system.creation?.choices.find((choice) => choice.field === "classId");
  const cls = classChoice?.options.find((option) => option.id === c.data["classId"]);

  return (
    <div
      className="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      <Name
        campaign={campaign}
        c={c}
        editable={editable}
        detail={`${cls?.name ?? c.data["classId"]} ${levelOf(c.data)}`}
      />
      <CharacterDetails {...section} />
      <FeatsLine c={c} />
      <VitalsSection {...section} />
      <LevelUp {...section} />
      <DeathSaves {...section} use={use} />
      <CombatStats d={d} editable={editable} use={use} />
      <AbilitiesSection {...section} use={use} />
      <SkillsSection {...section} use={use} />
      <ResourcePools {...section} />
      <RestSection {...section} />
      <ConditionsSection {...section} withExhaustion />
      <ActionsSection {...section} section={{ kind: "actions", label: "Actions" }} />
      {["spellbook", "cantrips", "prepared"].map((loadout) => (
        <SheetSectionView key={loadout} {...section} section={{ kind: "loadout", loadout }} />
      ))}
      <Inventory campaign={campaign} c={c} d={d} editable={editable} />
      <TextSection
        {...section}
        section={{
          kind: "text",
          label: "Features & notes",
          fields: [
            { field: "features", label: "Features and traits" },
            { field: "notes", label: "Notes" },
          ],
        }}
      />
      <p className="muted sheet-owner">
        {c.owner === me ? "Yours" : editable ? "Editing as GM" : "View only"}
      </p>
    </div>
  );
}

/** An NPC or monster: a stat block's numbers and text. */
export function DndNpcSheet({ campaign, system, c }: Props) {
  const ctx = useCampaign();
  const d = derive(c, system);
  const editable = canEdit(campaign, c);
  const maxHp = num(c.data["maxHp"]);
  const use = useAction({ system, c });
  const section = { campaign, system, c, d, editable };
  const field = (id: string) => (
    <NpcField
      campaign={campaign}
      c={c}
      field={system.npcFields.find((f) => f.id === id)!}
      editable={editable}
    />
  );
  return (
    <div
      className="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      <Name campaign={campaign} c={c} editable={editable} detail="NPC" />
      <section className="form-section sheet-section" aria-label="Vitals">
        <h3 className="sheet-heading">Vitals</h3>
        <div className="sheet-vitals">
          <Counter
            label="HP"
            value={c.resources["hp"] ?? 0}
            max={maxHp}
            disabled={!editable}
            onChange={(by) =>
              ctx.execute(bumpResource, { id: c.id, resource: "hp", by, max: maxHp })
            }
          />
          <label className="counter">
            <span className="eyebrow">Max HP</span>
            <input
              className="stat-score"
              type="number"
              min={1}
              value={maxHp}
              disabled={!editable}
              onChange={(e) => {
                const value = parseInputNumber(e.currentTarget.value);
                if (value !== undefined && value >= 1)
                  ctx.execute(setData, { id: c.id, key: "maxHp", value: Math.floor(value) });
              }}
            />
          </label>
          <Counter
            label="Temp HP"
            value={num(c.data["tempHp"])}
            disabled={!editable}
            onChange={(by) => ctx.execute(bumpData, { id: c.id, key: "tempHp", by })}
          />
        </div>
      </section>
      <section className="form-section sheet-section" aria-label="Defenses">
        <h3 className="sheet-heading">Defenses</h3>
        <div className="dnd-fields">
          {field("ac")}
          {field("speed")}
          {field("cr")}
        </div>
      </section>
      <section className="form-section sheet-derived-group" aria-label="Combat">
        <h3 className="sheet-heading">Combat</h3>
        <dl className="sheet-derived">
          <div>
            <dt>Initiative</dt>
            <dd>
              <button
                type="button"
                className="dnd-roll"
                disabled={!editable}
                onClick={() => use("initiative")}
              >
                {signedStr(valueOf(d.values, "initiative"))}
              </button>
            </dd>
          </div>
        </dl>
      </section>
      <AbilitiesSection {...section} use={use} />
      <section className="form-section sheet-section" aria-label="Traits and actions">
        <h3 className="sheet-heading">Traits and actions</h3>
        {field("senses")}
        {field("languages")}
        {field("traits")}
        {field("actions")}
      </section>
      <ConditionsSection {...section} withExhaustion={false} />
      <Inventory campaign={campaign} c={c} editable={editable} />
      <CharacterText campaign={campaign} c={c} field="notes" label="Notes" editable={editable} />
    </div>
  );
}
