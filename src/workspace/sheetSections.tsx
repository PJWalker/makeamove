import { actionsFor } from "../features/characters/store";
import type { CharacterView } from "../features/characters/types";
import { parse } from "../features/dice/notation";
import { CLASS_FIELD, choicesAt } from "../features/characters/creation";
import type { Campaign } from "../campaign/campaign";
import type { Derived, GameSystem, SheetSection } from "../systems/types";
import { parseInputNumber } from "../lib/number";
import { Button } from "../ui/Button";
import { OptionPicker } from "../ui/OptionPicker";
import { CharacterText } from "./CharacterText";
import { Counter, MoveList, TokenChip } from "./sheetParts";
import { signedStr } from "./actionPresentation";
import { useCampaign } from "./campaignContext";
import { roll } from "./commands/chat";
import {
  setData,
  setField,
  setLearned,
  setModifier,
  setNpcField,
  startMove,
} from "./commands/characters";

/* The sheet sections that are only fields, lists and buttons over a character, one component for each kind. */

/** What every sheet section is shown with. */
export type SectionContext = {
  campaign: Campaign;
  system: GameSystem;
  c: CharacterView;
  d: Derived;
  editable: boolean;
};

/** The section of a given kind. */
type Of<K extends SheetSection["kind"]> = Extract<SheetSection, { kind: K }>;
type SectionProps<K extends SheetSection["kind"]> = SectionContext & { section: Of<K> };

/** A titled block of the sheet. */
function Block({
  label,
  heading = label,
  children,
  ...rest
}: {
  label: string;
  heading?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className="form-section sheet-section" aria-label={label} {...rest}>
      <h3 className="sheet-heading">{heading}</h3>
      {children}
    </section>
  );
}

export function HeaderSection({ campaign, system, c, editable }: SectionContext) {
  const ctx = useCampaign();
  const classChoice =
    c.kind === "pc"
      ? choicesAt(system.creation, "create", c.data).find((choice) => choice.field === CLASS_FIELD)
      : undefined;
  return (
    <header className="sheet-head">
      <TokenChip campaign={campaign} c={c} editable={editable} />
      <div className="sheet-title">
        <input
          className="sheet-name"
          aria-label="Name"
          value={c.name}
          disabled={!editable}
          onChange={(e) =>
            e.currentTarget.value.trim() &&
            ctx.execute(setField, { id: c.id, key: "name", value: e.currentTarget.value.trim() })
          }
        />
        <span className="muted">{c.kind === "npc" ? "NPC" : "Player character"}</span>
        {classChoice && (
          <OptionPicker
            label={classChoice.label}
            options={classChoice.options}
            value={String(c.data[CLASS_FIELD] ?? "")}
            disabled={!editable}
            onChange={(id) => ctx.execute(setData, { id: c.id, key: CLASS_FIELD, value: id })}
          />
        )}
      </div>
    </header>
  );
}

export function ChoicesSection({ system, c, editable, section }: SectionProps<"choices">) {
  const ctx = useCampaign();
  const rank = Number(
    system.creation?.advancementField ? c.data[system.creation.advancementField] : 0,
  );
  const sectionChoices = section.choices ? new Set(section.choices) : undefined;
  const choices = [
    ...choicesAt(system.creation, "create", c.data),
    ...Array.from({ length: rank }, (_, i) => choicesAt(system.creation, i + 1, c.data)).flat(),
  ].filter(
    (choice) => choice.field !== CLASS_FIELD && (!sectionChoices || sectionChoices.has(choice.id)),
  );
  if (!choices.length) return null;
  return (
    <Block label="Character choices">
      {choices.map((choice) => (
        <OptionPicker
          key={choice.id}
          label={choice.label}
          options={choice.options}
          value={String(c.data[choice.field] ?? "")}
          disabled={!editable}
          onChange={(id) => ctx.execute(setData, { id: c.id, key: choice.field, value: id })}
        />
      ))}
    </Block>
  );
}

/** One labelled field of the character's data: text, or a number kept within its bounds. */
function DataField({
  c,
  item,
  editable,
}: {
  c: CharacterView;
  item: Of<"fields">["items"][number];
  editable: boolean;
}) {
  const ctx = useCampaign();
  const change = (typed: string) => {
    if (item.type !== "number") {
      ctx.execute(setData, { id: c.id, key: item.field, value: typed });
      return;
    }
    const value = parseInputNumber(typed);
    const inBounds =
      value !== undefined &&
      (item.min === undefined || value >= item.min) &&
      (item.max === undefined || value <= item.max);
    if (inBounds) ctx.execute(setData, { id: c.id, key: item.field, value });
  };
  return (
    <label className="field">
      {item.label}
      <input
        type={item.type}
        min={item.type === "number" ? item.min : undefined}
        max={item.type === "number" ? item.max : undefined}
        value={String(c.data[item.field] ?? (item.type === "number" ? 0 : ""))}
        disabled={!editable}
        onChange={(event) => change(event.currentTarget.value)}
      />
    </label>
  );
}

export function FieldsSection({ c, editable, section }: SectionProps<"fields">) {
  return (
    <Block label={section.label ?? "Character details"} heading={section.label ?? "Details"}>
      {section.items.map((item) => (
        <DataField key={item.field} c={c} item={item} editable={editable} />
      ))}
    </Block>
  );
}

/** One entry of a sheet's list of derived numbers: its name, then its value. */
export function DerivedEntry({
  label,
  title,
  over,
  children,
}: {
  label: string;
  title?: string | undefined;
  over?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <div title={title} data-over={over}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A derived value, or a die to roll when it is one. */
function DerivedStat({ item, d }: { item: Of<"derived">["items"][number]; d: Derived }) {
  const ctx = useCampaign();
  const value = (id: string) => d.values[id] ?? 0;
  const plus = item.plus && value(item.plus) ? signedStr(value(item.plus)) : "";
  return (
    <DerivedEntry
      label={item.label}
      title={d.resolved.why[item.value]?.join("\n")}
      over={item.max ? value(item.value) > value(item.max) : undefined}
    >
      {item.format === "die" ? (
        <button
          type="button"
          className="sheet-derived-roll"
          title={`Roll ${item.label}`}
          aria-label={`Roll ${item.label}`}
          onClick={() =>
            void ctx.execute(roll, {
              formula: `d${value(item.value)}${plus}`,
              visibility: "public",
              comment: item.label,
            })
          }
        >
          d{value(item.value)}
          {plus}
        </button>
      ) : (
        <>
          {value(item.value)}
          {item.max && `/${value(item.max)}`}
        </>
      )}
    </DerivedEntry>
  );
}

export function DerivedSection({ d, section }: SectionProps<"derived">) {
  return (
    <section className="form-section sheet-derived-group" aria-label="Combat">
      <h3 className="sheet-heading">Combat</h3>
      <dl className="sheet-derived">
        {section.items.map((item) => (
          <DerivedStat key={item.label} item={item} d={d} />
        ))}
      </dl>
    </section>
  );
}

export function ModifiersSection({ system, c, editable, section }: SectionProps<"modifiers">) {
  const ctx = useCampaign();
  return (
    <Block label={section.label}>
      <div className="sheet-vitals">
        {system.modifiers.map((m) => (
          <Counter
            key={m.id}
            label={m.label}
            value={c.modifiers[m.id] ?? 0}
            disabled={!editable}
            onChange={(by) =>
              ctx.execute(setModifier, {
                id: c.id,
                modifier: m.id,
                value: (c.modifiers[m.id] ?? 0) + by,
              })
            }
          />
        ))}
      </div>
    </Block>
  );
}

export function ActionsSection({
  campaign,
  system,
  c,
  d,
  editable,
  section,
}: SectionProps<"actions">) {
  const ctx = useCampaign();
  return (
    <Block label={section.label} data-move-drop={editable ? c.id : undefined}>
      <MoveList
        campaign={campaign}
        system={system}
        moves={actionsFor(c, system, d)}
        ownerId={c.id}
        onMake={(m) => ctx.execute(startMove, { characterId: c.id, move: m.id })}
        learned={c.learned}
        onForget={
          editable
            ? (m) => ctx.execute(setLearned, { id: c.id, action: m.id, known: false })
            : undefined
        }
      />
    </Block>
  );
}

/** Whether text is a dice formula the sheet can roll. */
function isFormula(text: string) {
  try {
    parse(text);
    return true;
  } catch {
    return false;
  }
}

/** One of an NPC's own fields: long text, or a line that may be a formula to roll. */
export function NpcField({
  campaign,
  c,
  field: f,
  editable,
}: {
  campaign: Campaign;
  c: CharacterView;
  field: GameSystem["npcFields"][number];
  editable: boolean;
}) {
  const ctx = useCampaign();
  if (f.type === "longtext")
    return (
      <CharacterText
        campaign={campaign}
        c={c}
        field={`field:${f.id}`}
        label={f.label}
        editable={editable}
      />
    );
  return (
    <label className="field">
      {f.label}
      <span className={f.rollable ? "sheet-rollable-field" : undefined}>
        <input
          type={f.type === "number" ? "number" : "text"}
          value={c.fields[f.id]}
          disabled={!editable}
          onChange={(e) =>
            ctx.execute(setNpcField, {
              id: c.id,
              field: f.id,
              value:
                f.type === "number" ? Number(e.currentTarget.value) || 0 : e.currentTarget.value,
            })
          }
        />
        {f.rollable && isFormula(String(c.fields[f.id] ?? "")) && (
          <Button
            variant="secondary"
            onClick={() =>
              void ctx.execute(roll, {
                formula: String(c.fields[f.id]),
                visibility: "public",
                comment: f.label,
              })
            }
          >
            Roll
          </Button>
        )}
      </span>
    </label>
  );
}

export function NpcFieldsSection({
  campaign,
  system,
  c,
  editable,
  section,
}: SectionProps<"npcFields">) {
  const shown = section.fields ? new Set(section.fields) : undefined;
  return (
    <Block label="Details">
      {system.npcFields.map((f) =>
        !shown || shown.has(f.id) ? (
          <NpcField key={f.id} campaign={campaign} c={c} field={f} editable={editable} />
        ) : null,
      )}
    </Block>
  );
}

export function TextSection({ campaign, c, editable, section }: SectionProps<"text">) {
  const fields = section.fields.map((f) => (
    <CharacterText
      key={f.field}
      campaign={campaign}
      c={c}
      field={f.field}
      label={f.label}
      editable={editable}
      {...(f.placeholder ? { placeholder: f.placeholder } : {})}
    />
  ));
  return section.label ? <Block label={section.label}>{fields}</Block> : fields;
}
