import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  bumpData,
  bumpResource,
  canEdit,
  setData,
  setField,
  setLearned,
  setLoadout,
  setModifier,
  setNpcField,
  setScore,
  setConditionState,
  startMove,
  toggleCondition,
} from "../features/characters/api";
import { actionsFor, derive, statBonus } from "../features/characters/store";
import type { CharacterView } from "../features/characters/types";
import { conditionColour } from "../features/combat/pipColours";
import { postRoll } from "../features/chat/send";
import { parse } from "../features/dice/notation";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import type { Derived, GameSystem, SheetCounter, SheetSection } from "../systems/types";
import { CLASS_FIELD, choicesAt } from "../features/characters/creation";
import { commaListOf } from "../lib/list";
import { Button } from "../ui/Button";
import { OptionPicker } from "../ui/OptionPicker";
import { IconLock } from "../ui/icons";
import { menuTrigger } from "../ui/menuTrigger";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { CharacterText } from "./CharacterText";
import { AdvancementDialog } from "./CreationParts";
import { extensionOf } from "../systems/extensions";
import { registerEntityDrop, type DragEntity } from "./entityDrag";
import { Inventory } from "./Inventory";
import { Counter, MoveList, signedStr, TokenChip } from "./sheetParts";
import { useValue } from "../ui/useValue";

/*
 * Shared sections for system-owned sheet components, and a declarative
 * fallback for systems that supply layout data instead of components.
 */

export type SheetProps = { campaign: Campaign; system: GameSystem; c: CharacterView };
type Props = SheetProps & { layout: SheetSection[] };

const num = (v: unknown) => Number(v ?? 0);

export function useSheet(props: SheetProps) {
  return { ...props, d: derive(props.c, props.system), editable: canEdit(props.campaign, props.c) };
}

/** What a sheet takes when dropped on it, beyond gear and moves: a rules entity from the Libraries, say. */
export interface SheetDrop {
  accepts: (entity: DragEntity) => boolean;
  drop: (entity: DragEntity) => boolean | void;
}

export function SheetFrame({
  c,
  editable,
  drop,
  children,
}: SheetProps & { editable: boolean; drop?: SheetDrop | undefined; children: ReactNode }) {
  const me = useValue(device).id;
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element || !editable || !drop) return;
    return registerEntityDrop(element, drop.accepts, drop.drop);
  }, [editable, drop]);
  return (
    <div
      ref={frame}
      className="sheet"
      data-item-drop={editable ? c.id : undefined}
      data-move-drop={editable ? c.id : undefined}
    >
      {children}
      {c.kind === "pc" && (
        <p className="muted sheet-owner">
          {c.owner === me ? "Yours" : editable ? "Editing as GM" : "View only"}
        </p>
      )}
    </div>
  );
}

export function DeclarativeSheet({ layout, ...props }: Props) {
  const sheet = useSheet(props);
  return (
    <SheetFrame {...sheet}>
      {layout.map((section, index) => (
        <SheetSectionView key={index} {...sheet} section={section} />
      ))}
    </SheetFrame>
  );
}

type SectionProps = {
  campaign: Campaign;
  system: GameSystem;
  c: CharacterView;
  d: Derived;
  editable: boolean;
  section: SheetSection;
};

function Advancement({
  campaign,
  system,
  c,
  d,
  editable,
  section,
}: Omit<SectionProps, "section"> & { section: Extract<SheetSection, { kind: "advancement" }> }) {
  const [open, setOpen] = useState(false);
  const Actions = extensionOf(system).advancementActions;
  const needed = d.values[section.needed];
  if (
    !editable ||
    needed === undefined ||
    !Number.isFinite(needed) ||
    num(c.data[section.xp]) < needed
  )
    return null;
  return (
    <div className="sheet-advancement">
      <span>{section.label}</span>
      <Button size="sm" onClick={() => setOpen(true)}>
        {section.button}…
      </Button>
      {Actions && <Actions campaign={campaign} characterId={c.id} />}
      {open && (
        <AdvancementDialog campaign={campaign} characterId={c.id} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function Loadout({
  campaign,
  system,
  c,
  d,
  editable,
  id,
}: Omit<SectionProps, "section"> & { id: string }) {
  const [free, setFree] = useState(false);
  const [query, setQuery] = useState("");
  const definition = system.loadouts?.find((entry) => entry.id === id);
  if (!definition) return null;
  const max = typeof definition.max === "number" ? definition.max : (d.values[definition.max] ?? 0);
  const owned = definition.available?.(c, d) ?? commaListOf(c.data[definition.ownedField]);
  const active = commaListOf(c.data[definition.activeField]).slice(0, max);
  const options = definition.options.filter((option) => owned.includes(option.id));
  if (!options.length || max <= 0) return null;
  return (
    <section className="form-section sheet-section" aria-label={definition.label}>
      <h3 className="sheet-heading">
        {definition.label} ({active.length}/{max})
      </h3>
      {definition.freeSwapLabel && (
        <label className="check-option">
          <input
            type="checkbox"
            checked={free}
            disabled={!editable}
            onChange={(event) => setFree(event.currentTarget.checked)}
          />
          {definition.freeSwapLabel}
        </label>
      )}
      {options.length > 12 && (
        <input
          type="search"
          aria-label={`Search ${definition.label}`}
          value={query}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      )}
      {options
        .filter((option) => option.name.toLowerCase().includes(query.trim().toLowerCase()))
        .map((option) => {
          const selected = active.includes(option.id);
          const cost = definition.costs?.[option.id];
          const resource = cost && system.resources.find((entry) => entry.id === cost.resource);
          const affordable =
            !cost ||
            free ||
            (!!resource &&
              (c.resources[cost.resource] ?? 0) + cost.by <= (d.values[resource.max] ?? 0) &&
              (c.resources[cost.resource] ?? 0) + cost.by >= 0);
          return (
            <label key={option.id} className="check-option" title={option.text}>
              <input
                type="checkbox"
                checked={selected}
                disabled={!editable || (!selected && (active.length >= max || !affordable))}
                onChange={() =>
                  setLoadout(
                    campaign,
                    c.id,
                    id,
                    selected
                      ? active.filter((entry) => entry !== option.id)
                      : [...active, option.id],
                    free,
                  )
                }
              />
              {option.name}
            </label>
          );
        })}
    </section>
  );
}

export function SheetSectionView({ campaign, system, c, d, editable, section }: SectionProps) {
  const v = d.values;
  const set = (key: string, value: unknown) => setField(campaign, c.id, key, value);
  switch (section.kind) {
    case "header": {
      const classChoice =
        c.kind === "pc"
          ? choicesAt(system.creation, "create", c.data).find(
              (choice) => choice.field === CLASS_FIELD,
            )
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
                e.currentTarget.value.trim() && set("name", e.currentTarget.value.trim())
              }
            />
            <span className="muted">{c.kind === "npc" ? "NPC" : "Player character"}</span>
            {classChoice && (
              <OptionPicker
                label={classChoice.label}
                options={classChoice.options}
                value={String(c.data[CLASS_FIELD] ?? "")}
                disabled={!editable}
                onChange={(id) => setData(campaign, c.id, CLASS_FIELD, id)}
              />
            )}
          </div>
        </header>
      );
    }
    case "choices": {
      const field = system.creation?.advancementField;
      const rank = Number(field ? c.data[field] : 0);
      const choices = [
        ...choicesAt(system.creation, "create", c.data),
        ...Array.from({ length: rank }, (_, i) => choicesAt(system.creation, i + 1, c.data)).flat(),
      ].filter(
        (choice) =>
          choice.field !== CLASS_FIELD && (!section.choices || section.choices.includes(choice.id)),
      );
      if (!choices.length) return null;
      return (
        <section className="form-section sheet-section" aria-label="Character choices">
          <h3 className="sheet-heading">Character choices</h3>
          {choices.map((choice) => (
            <OptionPicker
              key={choice.id}
              label={choice.label}
              options={choice.options}
              value={String(c.data[choice.field] ?? "")}
              disabled={!editable}
              onChange={(id) => setData(campaign, c.id, choice.field, id)}
            />
          ))}
        </section>
      );
    }
    case "fields":
      return (
        <section
          className="form-section sheet-section"
          aria-label={section.label ?? "Character details"}
        >
          <h3 className="sheet-heading">{section.label ?? "Details"}</h3>
          {section.items.map((item) => (
            <label key={item.field} className="field">
              {item.label}
              <input
                type={item.type}
                min={item.type === "number" ? item.min : undefined}
                max={item.type === "number" ? item.max : undefined}
                value={String(c.data[item.field] ?? (item.type === "number" ? 0 : ""))}
                disabled={!editable}
                onChange={(event) => {
                  if (item.type === "number") {
                    const value = Number(event.currentTarget.value);
                    if (
                      !Number.isFinite(value) ||
                      (item.min !== undefined && value < item.min) ||
                      (item.max !== undefined && value > item.max)
                    )
                      return;
                    setData(campaign, c.id, item.field, value);
                  } else setData(campaign, c.id, item.field, event.currentTarget.value);
                }}
              />
            </label>
          ))}
        </section>
      );
    case "loadout":
      return (
        <Loadout
          campaign={campaign}
          system={system}
          c={c}
          d={d}
          editable={editable}
          id={section.loadout}
        />
      );
    case "counters":
      return (
        <section className="form-section sheet-section" aria-label="Vitals">
          <h3 className="sheet-heading">Vitals</h3>
          <div className="sheet-vitals">
            {section.items.map((item) => (
              <SheetNumber
                key={item.label}
                campaign={campaign}
                system={system}
                c={c}
                d={d}
                editable={editable}
                item={item}
              />
            ))}
          </div>
        </section>
      );
    case "advancement": {
      return (
        <Advancement
          campaign={campaign}
          system={system}
          c={c}
          d={d}
          editable={editable}
          section={section}
        />
      );
    }
    case "derived": {
      const derivedValue = (id: string) => v[id] ?? 0;
      return (
        <section className="form-section sheet-derived-group" aria-label="Combat">
          <h3 className="sheet-heading">Combat</h3>
          <dl className="sheet-derived">
            {section.items.map((item) => (
              <div
                key={item.label}
                title={d.resolved.why[item.value]?.join("\n")}
                data-over={item.max ? derivedValue(item.value) > derivedValue(item.max) : undefined}
              >
                <dt>{item.label}</dt>
                <dd>
                  {item.format === "die" ? (
                    <button
                      type="button"
                      className="sheet-derived-roll"
                      title={`Roll ${item.label}`}
                      aria-label={`Roll ${item.label}`}
                      onClick={() =>
                        postRoll(
                          campaign,
                          `d${derivedValue(item.value)}${item.plus && derivedValue(item.plus) ? signedStr(derivedValue(item.plus)) : ""}`,
                          "public",
                          item.label,
                        )
                      }
                    >
                      d{derivedValue(item.value)}
                      {item.plus && derivedValue(item.plus)
                        ? signedStr(derivedValue(item.plus))
                        : ""}
                    </button>
                  ) : (
                    <>
                      {derivedValue(item.value)}
                      {item.max && `/${derivedValue(item.max)}`}
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }
    case "stats":
      return (
        <Stats
          campaign={campaign}
          system={system}
          c={c}
          d={d}
          editable={editable}
          label={section.label}
          hint={section.hint}
          showScore={section.showScore !== false}
        />
      );
    case "modifiers":
      return (
        <section className="form-section sheet-section" aria-label={section.label}>
          <h3 className="sheet-heading">{section.label}</h3>
          <div className="sheet-vitals">
            {system.modifiers.map((m) => (
              <Counter
                key={m.id}
                label={m.label}
                value={c.modifiers[m.id] ?? 0}
                disabled={!editable}
                onChange={(by) => setModifier(campaign, c.id, m.id, (c.modifiers[m.id] ?? 0) + by)}
              />
            ))}
          </div>
        </section>
      );
    case "actions":
      return (
        <section
          className="form-section sheet-section"
          aria-label={section.label}
          data-move-drop={editable ? c.id : undefined}
        >
          <h3 className="sheet-heading">{section.label}</h3>
          <MoveList
            campaign={campaign}
            system={system}
            moves={actionsFor(c, system, d)}
            ownerId={c.id}
            onMake={(m) => startMove(campaign, c.id, m)}
            learned={c.learned}
            onForget={editable ? (m) => setLearned(campaign, c.id, m.id, false) : undefined}
          />
        </section>
      );
    case "inventory":
      return (
        <Inventory
          campaign={campaign}
          c={c}
          {...(c.kind === "pc" ? { d } : {})}
          editable={editable}
        />
      );
    case "npcFields":
      return (
        <section className="form-section sheet-section" aria-label="Details">
          <h3 className="sheet-heading">Details</h3>
          {system.npcFields
            .filter((field) => !section.fields || section.fields.includes(field.id))
            .map((f) =>
              f.type === "longtext" ? (
                <CharacterText
                  key={f.id}
                  campaign={campaign}
                  c={c}
                  field={`field:${f.id}`}
                  label={f.label}
                  editable={editable}
                />
              ) : (
                <label key={f.id} className="field">
                  {f.label}
                  <span className={f.rollable ? "sheet-rollable-field" : undefined}>
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      value={c.fields[f.id]}
                      disabled={!editable}
                      onChange={(e) =>
                        setNpcField(
                          campaign,
                          c.id,
                          f.id,
                          f.type === "number"
                            ? Number(e.currentTarget.value) || 0
                            : e.currentTarget.value,
                        )
                      }
                    />
                    {f.rollable && isFormula(String(c.fields[f.id] ?? "")) && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          postRoll(campaign, String(c.fields[f.id]), "public", f.label)
                        }
                      >
                        Roll
                      </Button>
                    )}
                  </span>
                </label>
              ),
            )}
        </section>
      );
    case "text": {
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
      if (!section.label) return <>{fields}</>;
      return (
        <section className="form-section sheet-section" aria-label={section.label}>
          <h3 className="sheet-heading">{section.label}</h3>
          {fields}
        </section>
      );
    }
  }
}

/** One number: a resource, a data field or the level. */
function SheetNumber({
  campaign,
  system,
  c,
  d,
  editable,
  item,
}: {
  campaign: Campaign;
  system: GameSystem;
  c: CharacterView;
  d: Derived;
  editable: boolean;
  item: SheetCounter;
}) {
  const max = "max" in item && item.max ? d.values[item.max] : undefined;
  if ("resource" in item) {
    const value = c.resources[item.resource] ?? 0;
    const status = system.resources.find((resource) => resource.id === item.resource)?.status;
    const active = !!status && value <= (d.values[status.atOrBelow] ?? 0);
    return (
      <Counter
        label={item.label}
        value={value}
        max={max}
        disabled={!editable}
        onChange={(by) => bumpResource(campaign, c.id, item.resource, by, max)}
        status={
          status && active
            ? {
                name: status.name,
                colour: status.colour,
                title: `${status.name} at ${d.values[status.atOrBelow] ?? 0} ${item.label} or less`,
              }
            : undefined
        }
      />
    );
  }
  const value = num(c.data[item.data]);
  if (item.input) {
    return (
      <label className="counter">
        <span className="eyebrow">{item.label}</span>
        <input
          className="stat-score"
          type="number"
          min={1}
          value={value}
          disabled={!editable}
          onChange={(e) => {
            const n = Math.floor(Number(e.currentTarget.value));
            if (n >= 1) setData(campaign, c.id, item.data, n);
          }}
        />
      </label>
    );
  }
  return (
    <Counter
      label={item.label}
      value={value}
      max={max}
      disabled={!editable}
      onChange={(by) => bumpData(campaign, c.id, item.data, by)}
    />
  );
}

/** Each stat: its modifier (click to roll), its score, and the condition tied to it, if any. */
function Stats({
  campaign,
  system,
  c,
  d,
  editable,
  label,
  hint,
  showScore,
}: Omit<SectionProps, "section"> & {
  label: string;
  hint?: string | undefined;
  showScore: boolean;
}) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    label: string;
    items: MenuItem[];
  } | null>(null);
  const rollStat = (statId: string, abbr: string) => {
    const mod = statBonus(d, statId);
    const formula = `${system.baseRoll}${mod ? `${mod < 0 ? "-" : "+"}${Math.abs(mod)}` : ""}[${abbr}]`;
    postRoll(campaign, system.checkRoll?.(formula, statId, c) ?? formula, "public", abbr);
  };
  return (
    <section className="form-section sheet-section" aria-label={label}>
      <h3 className="sheet-heading">
        {label} {hint && <span className="muted">· {hint}</span>}
      </h3>
      <ul
        className="sheet-stats"
        data-lockable={system.conditions.some((condition) => condition.lockable)}
      >
        {system.stats.map((s) => {
          const tied = system.conditions.find((x) => x.stat === s.id);
          const has = !!tied && c.conditions.includes(tied.id);
          const state =
            tied && c.lockedConditions?.includes(tied.id) ? "locked" : has ? "marked" : "clear";
          const nextState = state === "clear" ? "marked" : state === "marked" ? "locked" : "clear";
          const trigger = menuTrigger((x, y) => {
            if (!editable) return;
            const min = s.min ?? 1;
            const max = s.max ?? 20;
            setMenu({
              x,
              y,
              label: `Edit ${s.name}`,
              items: Array.from({ length: max - min + 1 }, (_, index) => {
                const value = min + index;
                return {
                  label: `Set ${s.name} to ${showScore ? value : signedStr(value)}`,
                  checked: c.scores[s.id] === value,
                  onSelect: () => setScore(campaign, c.id, s.id, value),
                };
              }),
            });
          });
          return (
            <li
              key={s.id}
              data-debilitated={has}
              style={
                tied && has ? { "--condition-colour": conditionColour(system, tied.id) } : undefined
              }
            >
              <span className="stat-abbr" title={s.name}>
                {s.abbr}
              </span>
              <button
                type="button"
                className="stat-mod"
                title={`Roll +${s.name}`}
                aria-label={`Roll +${s.name}`}
                onClick={() => rollStat(s.id, s.abbr)}
                onPointerDown={editable ? trigger.onPointerDown : undefined}
                onContextMenu={editable ? trigger.onContextMenu : undefined}
              >
                {signedStr(statBonus(d, s.id))}
              </button>
              {showScore && (
                <label className="stat-score-label">
                  <span className="muted">Score</span>
                  <input
                    className="stat-score"
                    type="number"
                    min={s.min ?? 1}
                    max={s.max ?? 20}
                    aria-label={`${s.name} score`}
                    value={c.scores[s.id]}
                    disabled={!editable}
                    onChange={(e) => {
                      const n = Number(e.currentTarget.value);
                      if (Number.isInteger(n) && n >= (s.min ?? 1) && n <= (s.max ?? 20))
                        setScore(campaign, c.id, s.id, n);
                    }}
                  />
                </label>
              )}
              {tied?.lockable ? (
                <button
                  type="button"
                  className="stat-deb condition-status"
                  data-state={state}
                  style={{
                    "--condition-colour": conditionColour(system, tied.id),
                  }}
                  aria-label={`${tied.name}: ${state}. ${nextState === "clear" ? "Clear" : nextState === "marked" ? "Mark" : "Lock"} condition`}
                  title={`${tied.name}: ${state}`}
                  disabled={!editable}
                  onClick={() => setConditionState(campaign, c.id, tied.id, nextState)}
                >
                  <span className="condition-symbol" aria-hidden="true">
                    {state === "locked" ? (
                      <IconLock size={16} />
                    ) : (
                      <span className="condition-dot" />
                    )}
                  </span>
                  <span className="condition-name">{tied.name}</span>
                </button>
              ) : (
                tied && (
                  <label className="stat-deb">
                    <input
                      type="checkbox"
                      checked={has}
                      disabled={!editable}
                      onChange={() => toggleCondition(campaign, c.id, tied.id)}
                    />
                    {tied.name}
                  </label>
                )
              )}
            </li>
          );
        })}
      </ul>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </section>
  );
}

/** Whether the text is a dice formula the roller reads. */
function isFormula(text: string) {
  try {
    parse(text);
    return true;
  } catch {
    return false;
  }
}
