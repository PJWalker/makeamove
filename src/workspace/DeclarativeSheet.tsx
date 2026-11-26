import { useEffect, useMemo, useRef, useState   } from "react";
import type {ComponentType, ReactNode} from "react";
import { statBonus } from "../features/characters/store";
import type { ConditionState } from "../features/characters/sheet";
import type { CharacterView } from "../features/characters/types";
import { conditionColour } from "../features/combat/pipColours";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import type { Derived, GameSystem, SheetCounter, SheetSection } from "../systems/types";
import type { SheetProps as SheetProperties } from "../systems/extensionTypes";
import { commaListOf } from "../lib/list";
import parseInputNumber from "../lib/number";
import Button from "../ui/Button";
import { IconLock } from "../ui/icons";
import menuTrigger from "../ui/menuTrigger";
import { ContextMenu  } from "../ui/ContextMenu";
import type {MenuItem} from "../ui/ContextMenu";
import { useQuery } from "../ui/useQuery";
import { AdvancementDialog } from "./CreationParts";
import { useExtension } from "./systemExtensions";
import { registerEntityDrop  } from "./entityDrag";
import type {DragEntity} from "./entityDrag";
import Inventory from "./Inventory";
import { Counter } from "./sheetParts";
import { signedStr as signedString } from "./actionPresentation";
import {
  ActionsSection,
  ChoicesSection,
  DerivedSection,
  FieldsSection,
  HeaderSection,
  ModifiersSection,
  NpcFieldsSection,
  TextSection
  
} from "./sheetSections";
import type {SectionContext} from "./sheetSections";
import {
  bumpData,
  bumpResource,
  setCondition,
  setData,
  setLoadout,
  setScore,
  toggleCondition,
} from "./commands/characters";
import { useCampaign } from "./campaignContext";
import { roll } from "./commands/chat";
import useSheet from "./sheetModel";

/*
 * Shared sections for system-owned sheet components, and a declarative
 * fallback for systems that supply layout data instead of components.
 */

export type { SheetProps } from "../systems/extensionTypes";
type Properties = SheetProperties & { layout: SheetSection[] };

const number_ = (v: unknown) => Number(v ?? 0);
const sectionKey = (section: SheetSection) => `${section.kind}:${JSON.stringify(section)}`;

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
}: SheetProperties & { editable: boolean; drop?: SheetDrop | undefined; children: ReactNode }) {
  const me = useQuery(device).id;
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
          {c.owner === me ? "Yours" : (editable ? "Editing as GM" : "View only")}
        </p>
      )}
    </div>
  );
}

export function DeclarativeSheet({ layout, ...properties }: Properties) {
  const sheet = useSheet(properties);
  const keys = useMemo(() => layout.map(sectionKey), [layout]);
  return (
    <SheetFrame {...sheet}>
      {layout.map((section, index) => (
        <SheetSectionView key={keys[index]} {...sheet} section={section} />
      ))}
    </SheetFrame>
  );
}

function Advancement({ campaign, system, c, d, editable, section }: SectionOf<"advancement">) {
  const [open, setOpen] = useState(false);
  const Actions = useExtension(system).advancementActions;
  const needed = d.values[section.needed];
  if (
    !editable ||
    needed === undefined ||
    !Number.isFinite(needed) ||
    number_(c.data[section.xp]) < needed
  )
    return null;
  return (
    <div className="sheet-advancement">
      <span>{section.label}</span>
      <Button onClick={() => { setOpen(true); }}>{section.button}…</Button>
      {Actions && <Actions campaign={campaign} characterId={c.id} />}
      {open && (
        <AdvancementDialog campaign={campaign} characterId={c.id} onClose={() => { setOpen(false); }} />
      )}
    </div>
  );
}

function Loadout({ system, c, d, editable, id }: SectionContext & { id: string }) {
  const loadout = useLoadout({ system, c, d, id });
  if (!loadout) return null;
  const { definition, max, active, options, free, setFree, query, setQuery, toggleOption } =
    loadout;
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
            onChange={(event) => { setFree(event.currentTarget.checked); }}
          />
          {definition.freeSwapLabel}
        </label>
      )}
      {options.length > 12 && (
        <input
          type="search"
          aria-label={`Search ${definition.label}`}
          value={query}
          onInput={(event) => { setQuery(event.currentTarget.value); }}
        />
      )}
      {options.map(({ option, selected, affordable }) => (
        <label key={option.id} className="check-option" title={option.text}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!editable || (!selected && (active.length >= max || !affordable))}
            onChange={() => { toggleOption(option.id); }}
          />
          {option.name}
        </label>
      ))}
    </section>
  );
}

function useLoadout({
  system,
  c,
  d,
  id,
}: Pick<SectionContext, "c" | "d" | "system"> & { id: string }) {
  const context = useCampaign();
  const [free, setFree] = useState(false);
  const [query, setQuery] = useState("");
  const definition = system.loadouts?.find((entry) => entry.id === id);
  if (!definition) return null;
  const max = typeof definition.max === "number" ? definition.max : (d.values[definition.max] ?? 0);
  const owned = definition.available?.(c, d) ?? commaListOf(c.data[definition.ownedField]);
  const ownedIds = new Set(owned);
  const active = commaListOf(c.data[definition.activeField]).slice(0, max);
  const activeIds = new Set(active);
  const options = definition.options.flatMap((option) => {
    if (!ownedIds.has(option.id) || !option.name.toLowerCase().includes(query.trim().toLowerCase()))
      return [];
    const cost = definition.costs?.[option.id];
    const resource = cost && system.resources.find((entry) => entry.id === cost.resource);
    const affordable =
      !cost ||
      free ||
      (!!resource &&
        (c.resources[cost.resource] ?? 0) + cost.by <= (d.values[resource.max] ?? 0) &&
        (c.resources[cost.resource] ?? 0) + cost.by >= 0);
    return [{ option, affordable, selected: activeIds.has(option.id) }];
  });
  if (options.length === 0 || max <= 0) return null;
  const toggleOption = (optionId: string) => {
    const selected = activeIds.has(optionId);
    context.execute(setLoadout, {
      id: c.id,
      loadout: id,
      options: selected ? active.filter((entry) => entry !== optionId) : [...active, optionId],
      free,
    });
  };
  return { definition, max, active, options, free, setFree, query, setQuery, toggleOption };
}

type SectionOf<K extends SheetSection["kind"]> = SectionContext & {
  section: Extract<SheetSection, { kind: K }>;
};

function LoadoutSection({ section, ...context }: SectionOf<"loadout">) {
  return <Loadout {...context} id={section.loadout} />;
}

function CountersSection({ section, ...context }: SectionOf<"counters">) {
  return (
    <section className="form-section sheet-section" aria-label="Vitals">
      <h3 className="sheet-heading">Vitals</h3>
      <div className="sheet-vitals">
        {section.items.map((item) => (
          <SheetNumber key={item.label} {...context} item={item} />
        ))}
      </div>
    </section>
  );
}

function StatsSection({ section, ...context }: SectionOf<"stats">) {
  return (
    <Stats
      {...context}
      label={section.label}
      hint={section.hint}
      showScore={section.showScore !== false}
    />
  );
}

function InventorySection({ campaign, c, d, editable }: SectionOf<"inventory">) {
  return (
    <Inventory campaign={campaign} c={c} {...(c.kind === "pc" ? { d } : {})} editable={editable} />
  );
}

/** The view for each kind of section. */
const SECTION_VIEWS: {
  [K in SheetSection["kind"]]: ComponentType<SectionOf<K>>;
} = {
  header: HeaderSection,
  choices: ChoicesSection,
  fields: FieldsSection,
  loadout: LoadoutSection,
  counters: CountersSection,
  advancement: Advancement,
  derived: DerivedSection,
  stats: StatsSection,
  modifiers: ModifiersSection,
  actions: ActionsSection,
  inventory: InventorySection,
  npcFields: NpcFieldsSection,
  text: TextSection,
};

export function SheetSectionView({
  section,
  ...context
}: SectionContext & { section: SheetSection }) {
  const View = SECTION_VIEWS[section.kind] as ComponentType<
    SectionContext & { section: SheetSection }
  >;
  return <View {...context} section={section} />;
}

/** One number: a resource, a data field or the level. */
function SheetNumber({
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
  const context = useCampaign();
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
        onChange={(by) => context.execute(bumpResource, { id: c.id, resource: item.resource, by, max })}
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
  const value = number_(c.data[item.data]);
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
            const value = parseInputNumber(e.currentTarget.value);
            if (value !== undefined && value >= 1)
              context.execute(setData, { id: c.id, key: item.data, value: Math.floor(value) });
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
      onChange={(by) => context.execute(bumpData, { id: c.id, key: item.data, by })}
    />
  );
}

/** Each stat: its modifier (click to roll), its score, and the condition tied to it, if any. */
function Stats({
  system,
  c,
  d,
  editable,
  label,
  hint,
  showScore,
}: SectionContext & {
  label: string;
  hint?: string | undefined;
  showScore: boolean;
}) {
  const {
    menu,
    setMenu,
    lockable,
    rows,
    rollStat,
    updateScore,
    cycleCondition,
    toggleConditionState,
  } = useStats({ system, c, d, editable, showScore });
  return (
    <section className="form-section sheet-section" aria-label={label}>
      <h3 className="sheet-heading">
        {label} {hint && <span className="muted">· {hint}</span>}
      </h3>
      <ul className="sheet-stats" data-lockable={lockable}>
        {rows.map(({ stat, tied, has, state, nextState, trigger }) => (
          <li
            key={stat.id}
            data-debilitated={has}
            style={
              tied && has ? { "--condition-colour": conditionColour(system, tied.id) } : undefined
            }
          >
            <span className="stat-abbr" title={stat.name}>
              {stat.abbr}
            </span>
            <button
              type="button"
              className="stat-mod"
              title={`Roll +${stat.name}`}
              aria-label={`Roll +${stat.name}`}
              onClick={() => { rollStat(stat.id, stat.abbr); }}
              onPointerDown={editable ? trigger.onPointerDown : undefined}
              onContextMenu={editable ? trigger.onContextMenu : undefined}
            >
              {signedString(statBonus(d, stat.id))}
            </button>
            {showScore && (
              <label className="stat-score-label">
                <span className="muted">Score</span>
                <input
                  className="stat-score"
                  type="number"
                  min={stat.min ?? 1}
                  max={stat.max ?? 20}
                  aria-label={`${stat.name} score`}
                  value={c.scores[stat.id]}
                  disabled={!editable}
                  onChange={(event) => { updateScore(stat, event.currentTarget.value); }}
                />
              </label>
            )}
            {tied?.lockable ? (
              <button
                type="button"
                className="stat-deb condition-status"
                data-state={state}
                style={{ "--condition-colour": conditionColour(system, tied.id) }}
                aria-label={`${tied.name}: ${state}. ${CONDITION_VERB[nextState]} condition`}
                title={`${tied.name}: ${state}`}
                disabled={!editable}
                onClick={() => cycleCondition(tied.id, nextState)}
              >
                <span className="condition-symbol" aria-hidden="true">
                  {state === "locked" ? <IconLock size={16} /> : <span className="condition-dot" />}
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
                    onChange={() => toggleConditionState(tied.id)}
                  />
                  {tied.name}
                </label>
              )
            )}
          </li>
        ))}
      </ul>
      {menu && <ContextMenu {...menu} onClose={() => { setMenu(null); }} />}
    </section>
  );
}

/** A lockable condition cycles clear, marked, locked, and back. */
const NEXT_CONDITION_STATE: Record<ConditionState, ConditionState> = {
  clear: "marked",
  marked: "locked",
  locked: "clear",
};
/** What pressing a condition does, by the state it moves to. */
const CONDITION_VERB: Record<ConditionState, string> = {
  clear: "Clear",
  marked: "Mark",
  locked: "Lock",
};

function useStats({
  system,
  c,
  d,
  editable,
  showScore,
}: Pick<SectionContext, "c" | "d" | "editable" | "system"> & { showScore: boolean }) {
  const context = useCampaign();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    label: string;
    items: MenuItem[];
  } | null>(null);
  const rollStat = (statId: string, abbr: string) => {
    const module_ = statBonus(d, statId);
    const formula = `${system.baseRoll}${module_ ? `${module_ < 0 ? "-" : "+"}${Math.abs(module_)}` : ""}[${abbr}]`;
    void context.execute(roll, {
      formula: system.checkRoll?.(formula, statId, c) ?? formula,
      visibility: "public",
      comment: abbr,
    });
  };
  const conditionIds = new Set(c.conditions);
  const lockedConditionIds = new Set(c.lockedConditions ?? []);
  const rows = system.stats.map((stat) => {
    const tied = system.conditions.find((condition) => condition.stat === stat.id);
    const has = !!tied && conditionIds.has(tied.id);
    let state: ConditionState = has ? "marked" : "clear";
    if (tied && lockedConditionIds.has(tied.id)) state = "locked";
    const nextState = NEXT_CONDITION_STATE[state];
    const trigger = menuTrigger((x, y) => {
      if (!editable) return;
      const min = stat.min ?? 1;
      const max = stat.max ?? 20;
      setMenu({
        x,
        y,
        label: `Edit ${stat.name}`,
        items: Array.from({ length: max - min + 1 }, (_, index) => {
          const value = min + index;
          return {
            label: `Set ${stat.name} to ${showScore ? value : signedString(value)}`,
            checked: c.scores[stat.id] === value,
            onSelect: () => context.execute(setScore, { id: c.id, stat: stat.id, score: value }),
          };
        }),
      });
    });
    return { stat, tied, has, state, nextState, trigger };
  });
  const updateScore = (stat: GameSystem["stats"][number], typed: string) => {
    const value = parseInputNumber(typed);
    if (
      value !== undefined &&
      Number.isInteger(value) &&
      value >= (stat.min ?? 1) &&
      value <= (stat.max ?? 20)
    )
      context.execute(setScore, { id: c.id, stat: stat.id, score: value });
  };
  return {
    menu,
    setMenu,
    lockable: system.conditions.some((condition) => condition.lockable),
    rows,
    rollStat,
    updateScore,
    cycleCondition: (condition: string, state: "clear" | "locked" | "marked") =>
      context.execute(setCondition, { id: c.id, condition, state }),
    toggleConditionState: (condition: string) =>
      context.execute(toggleCondition, { id: c.id, condition }),
  };
}
