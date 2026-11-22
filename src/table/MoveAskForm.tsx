import { useEffect, useRef  } from "react";
import type {ReactNode} from "react";
import { getCharacter, systemOf } from "../features/characters/api";
import {
  canPayMove,
  checkOf,
  needsChoice,
  planMove,
  rollModesFor,
  saveOf,
} from "../features/characters/moves";
import { derive } from "../features/characters/store";
import type { CharacterView } from "../features/characters/types";
import type { MoveTarget } from "../features/chat/types";
import type { Campaign } from "../campaign/campaign";
import type { ActionDef, GameSystem } from "../systems/types";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { useCampaign } from "../workspace/campaignContext";
import { makeMove } from "../workspace/commands/characters";
import { useDraft } from "./useDraft";

type Ask = NonNullable<ReturnType<typeof needsChoice>>;
type Check = NonNullable<ReturnType<typeof checkOf>>;
type RollBonus = NonNullable<Check["rollBonuses"]>[number];

/** Everything the form can ask, as typed. */
interface Draft {
  stat: string;
  difficulty: string;
  counterMessageId: string;
  rollBonuses: string[];
  askedNumber: number;
  yeses: string[];
  extra: number;
  variant: string;
}

interface DifficultySpec { prompt: string; initial?: number | undefined; min?: number; max?: number }

/** A formula without its labels, as the Roll button reads: 1d20+2[Prof] → 1d20+2. */
const bare = (formula: string) => formula.replaceAll(/\[[^\]]*]/g, "");

/** Whether the move asks for a difficulty: its own, or when a target's defense isn't known. */
function difficultyAsked(
  campaign: Campaign,
  system: GameSystem,
  move: ActionDef,
  targets: MoveTarget[] | undefined,
): DifficultySpec | undefined {
  const source = checkOf(move)?.difficulty ?? saveOf(move)?.difficulty;
  if (source?.kind === "prompt") return source;
  if (source?.kind !== "target") return undefined;
  const unknown = targets?.some((target) => {
    const character = getCharacter(campaign, target.characterId);
    return !character || derive(character, system).values[source.value] === undefined;
  });
  return unknown
    ? { prompt: "Difficulty for targets with unknown defense", initial: 10, min: 0, max: 99 }
    : undefined;
}

/** The difficulty typed, if it is a number the move accepts. */
function chosenDifficulty(spec: DifficultySpec | undefined, typed: string) {
  if (!spec || !typed.trim()) return;
  const value = Number(typed);
  return Number.isFinite(value) && value >= (spec.min ?? 0) && value <= (spec.max ?? 99)
    ? value
    : undefined;
}

/** Whether the draft answers everything the move asks. */
function answered(ask: Ask | null, check: Check | undefined, draft: Draft, difficultyOk: boolean) {
  return (
    (ask?.kind !== "stat" || !!draft.stat) &&
    (!check?.counter || !!draft.counterMessageId) &&
    difficultyOk
  );
}

/** What the draft chooses for a roll mode, as the plan takes it. */
function choiceOf(
  ask: Ask | null,
  check: Check | undefined,
  draft: Draft,
  difficulty: number | undefined,
  mode: string,
) {
  return {
    stat: draft.stat || undefined,
    ask: ask?.kind === "questions" ? draft.yeses.length : draft.askedNumber,
    extra: draft.extra,
    mode: mode || undefined,
    difficulty,
    counterMessageId: check?.counter ? draft.counterMessageId : undefined,
    rollBonuses: draft.rollBonuses,
    variant: draft.variant || undefined,
  };
}

function toggled(list: string[], id: string, on: boolean) {
  return on ? [...list, id] : list.filter((entry) => entry !== id);
}

/** The stat or number the check needs and an extra bonus, then a Roll for each roll mode (disadvantage, roll, advantage). */
export function AskStep({
  campaign,
  characterId,
  moveId,
}: {
  campaign: Campaign;
  characterId: string;
  moveId: string;
}) {
  const {
    system,
    move,
    c,
    ask,
    check,
    difficultySpec,
    counters,
    draft,
    patch,
    formRef,
    rollBonuses,
    rollFor,
    go,
  } = useAskStep(campaign, characterId, moveId);
  return (
    <form
      ref={formRef}
      className="move-form"
      onSubmit={(event) => {
        event.preventDefault();
        go("");
      }}
    >
      <VariantField
        variants={move.variants?.(c, derive(c, system))}
        value={draft.variant}
        onChange={(variant) => { patch({ variant }); }}
      />
      <AskedField ask={ask} system={system} draft={draft} patch={patch} />
      <DifficultyField
        spec={difficultySpec}
        value={draft.difficulty}
        onChange={(value) => { patch({ difficulty: value }); }}
      />
      <CounterField
        spec={check?.counter}
        counters={counters}
        value={draft.counterMessageId}
        onChange={(counterMessageId) => { patch({ counterMessageId }); }}
      />
      {(check?.rollBonuses ?? []).map((bonus) => (
        <RollBonusField
          key={bonus.id}
          bonus={bonus}
          character={c}
          selected={rollBonuses.has(bonus.id)}
          onChange={(on) => { patch({ rollBonuses: toggled(draft.rollBonuses, bonus.id, on) }); }}
        />
      ))}
      <ExtraBonusField shown={!!check} value={draft.extra} onChange={(extra) => { patch({ extra }); }} />
      <RollActions
        modes={check ? rollModesFor(system, move) : undefined}
        defaultLabel={system.defaultRollLabel ?? "Roll"}
        rollFor={rollFor}
        onRoll={go}
      />
    </form>
  );
}

function useAskStep(campaign: Campaign, characterId: string, moveId: string) {
  const context = useCampaign();
  const system = systemOf(campaign);
  const move = system.actions.find((m) => m.id === moveId)!;
  const c = getCharacter(campaign, characterId)!;
  const request = campaign.moves.actor.getSnapshot().context.ask;
  const targets = request?.targets;
  const ask = needsChoice(move);
  const check = checkOf(move);
  const difficultySpec = difficultyAsked(campaign, system, move, targets);
  const counters = campaign.chat.messages.value.flatMap((m) => (m.kind === "counter" ? [m] : []));
  const [draft, patch] = useDraft<Draft>({
    stat: "",
    difficulty: String(difficultySpec?.initial ?? 10),
    counterMessageId: counters[0]?.id ?? "",
    rollBonuses: [],
    askedNumber: ask?.kind === "number" ? (ask.initial ?? 1) : 1,
    yeses: [],
    extra: request?.choice?.extra ?? 0,
    variant: "",
  });
  const formReference = useRef<HTMLFormElement>(null);
  // Enter rolls straight away.
  useEffect(
    () =>
      formReference.current
        ?.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.focus({ preventScroll: true }),
    [],
  );

  const difficulty = chosenDifficulty(difficultySpec, draft.difficulty);
  const complete = answered(ask, check, draft, !difficultySpec || difficulty !== undefined);
  const rollFor = (mode: string) => {
    const plan = planMove(
      system,
      move,
      c,
      derive(c, system),
      choiceOf(ask, check, draft, difficulty, mode),
    );
    return { formula: plan.formula, ready: complete && canPayMove(c, plan) };
  };
  const go = (mode: string) => {
    if (!rollFor(mode).ready) return;
    const choice = choiceOf(ask, check, draft, difficulty, mode);
    void context.execute(makeMove, { characterId: c.id, move, choice, targets });
    campaign.moves.ask(null);
  };
  const rollBonuses = new Set(draft.rollBonuses);
  return {
    system,
    move,
    c,
    ask,
    check,
    difficultySpec,
    counters,
    draft,
    patch,
    formRef: formReference,
    rollBonuses,
    rollFor,
    go,
  };
}

function VariantField({
  variants,
  value,
  onChange,
}: {
  variants: readonly { id: string; label: string }[] | undefined;
  value: string;
  onChange: (id: string) => void;
}) {
  if (!variants) return null;
  return (
    <label className="field">
      Casting or use
      <select
        value={value || variants[0]?.id || ""}
        disabled={variants.length === 0}
        onChange={(event) => { onChange(event.currentTarget.value); }}
      >
        {variants.length === 0 && <option value="">No available uses</option>}
        {variants.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A labelled number field. */
function NumberField({
  label,
  value,
  min,
  max,
  required = true,
  className = "",
  onChange,
}: {
  label: ReactNode;
  value: number | string;
  min: number | undefined;
  max: number | undefined;
  required?: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      {label}
      <input
        type="number"
        required={required}
        min={min}
        max={max}
        value={value}
        onInput={(e) => { onChange(e.currentTarget.value); }}
      />
    </label>
  );
}

/** What the move asks the player: a stat to roll, a number, or a list of yes/no questions. */
function AskedField({
  ask,
  system,
  draft,
  patch,
}: {
  ask: Ask | null;
  system: GameSystem;
  draft: Draft;
  patch: (changes: Partial<Draft>) => void;
}) {
  if (!ask) return null;
  const yeses = new Set(draft.yeses);
  if (ask.kind === "stat")
    return (
      <Segmented
        label="Stat to roll"
        value={draft.stat}
        options={system.stats.map((s) => ({ id: s.id, label: s.abbr, title: s.name }))}
        onChange={(stat) => { patch({ stat }); }}
      />
    );
  if (ask.kind === "number")
    return (
      <NumberField
        label={ask.prompt}
        min={ask.min}
        max={ask.max}
        value={draft.askedNumber}
        onChange={(value) => { patch({ askedNumber: Number(value) || 0 }); }}
      />
    );
  return (
    <fieldset className="move-questions">
      <legend>{ask.prompt}</legend>
      {ask.questions.map((question) => (
        <label key={question} className="check-option">
          <input
            type="checkbox"
            checked={yeses.has(question)}
            onChange={(e) => { patch({ yeses: toggled(draft.yeses, question, e.currentTarget.checked) }); }
            }
          />
          {question}
        </label>
      ))}
    </fieldset>
  );
}

/** The difficulty the move asks for, when it does. */
function DifficultyField({
  spec,
  value,
  onChange,
}: {
  spec: DifficultySpec | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  if (!spec) return null;
  return (
    <NumberField
      label={spec.prompt}
      min={spec.min ?? 0}
      max={spec.max ?? 99}
      value={value}
      onChange={onChange}
    />
  );
}

/** A bonus on top of the check's own. */
function ExtraBonusField({
  shown,
  value,
  onChange,
}: {
  shown: boolean;
  value: number;
  onChange: (value: number) => void;
}) {
  if (!shown) return null;
  return (
    <NumberField
      className="roll-prompt-extra"
      label="Extra bonus"
      min={-10}
      max={10}
      value={value}
      required={false}
      onChange={(typed) => { onChange(Number(typed) || 0); }}
    />
  );
}

/** Which counter (a clock or count track from the chat) the roll works against. */
function CounterField({
  spec,
  counters,
  value,
  onChange,
}: {
  spec: { prompt: string } | undefined;
  counters: readonly { id: string; label: string; start: number; max?: number | undefined }[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (!spec) return null;
  return (
    <label className="field">
      {spec.prompt}
      <select
        value={value}
        disabled={counters.length === 0}
        onChange={(e) => { onChange(e.currentTarget.value); }}
      >
        <option value="">Choose a counter</option>
        {counters.map((counter) => (
          <option key={counter.id} value={counter.id}>
            {counter.label} ({counter.start}
            {counter.max === undefined ? "" : `/${counter.max}`})
          </option>
        ))}
      </select>
      {counters.length === 0 && (
        <span className="muted">Create a track with /clock or /count first.</span>
      )}
    </label>
  );
}

/** An optional bonus to the roll, with what it costs; hidden while its name is unset. */
function RollBonusField({
  bonus,
  character,
  selected,
  onChange,
}: {
  bonus: RollBonus;
  character: CharacterView;
  selected: boolean;
  onChange: (on: boolean) => void;
}) {
  if (bonus.nameField && !String(character.data[bonus.nameField] ?? "").trim()) return null;
  const {cost} = bonus;
  const unaffordable = !selected && !!cost && (character.resources[cost.resource] ?? 0) < cost.by;
  return (
    <label className="check-option">
      <input
        type="checkbox"
        checked={selected}
        disabled={unaffordable}
        onChange={(e) => { onChange(e.currentTarget.checked); }}
      />
      {bonus.nameField ? character.data[bonus.nameField] : bonus.label} (+
      {Number(character.data[bonus.valueField] ?? 0)};{" "}
      {cost ? `spend ${cost.by} ${cost.resource}` : "no cost"})
    </label>
  );
}

/** A Roll for each roll mode, the plain roll between the first half and the rest: Disadvantage, Roll, Advantage; or just Use, for a move with no check. */
function RollActions({
  modes,
  defaultLabel,
  rollFor,
  onRoll,
}: {
  modes: readonly { id: string; label: string }[] | undefined;
  defaultLabel: string;
  rollFor: (mode: string) => { formula: string; ready: boolean };
  onRoll: (mode: string) => void;
}) {
  const half = Math.floor((modes?.length ?? 0) / 2);
  const button = (mode: string, label: string) => {
    const { formula, ready } = rollFor(mode);
    return (
      <Button
        key={mode}
        variant={mode ? "secondary" : "primary"}
        // The plain roll submits, so Enter makes it; the modes are clicked.
        type={mode ? "button" : "submit"}
        disabled={!ready}
        title={ready ? bare(formula) : undefined}
        onClick={mode ? () => { onRoll(mode); } : undefined}
      >
        {label}
      </Button>
    );
  };
  if (!modes)
    return (
      <Button variant="primary" type="submit" disabled={!rollFor("").ready}>
        Use
      </Button>
    );
  return (
    <div className="roll-buttons">
      {modes.slice(0, half).map((m) => button(m.id, m.label))}
      {button("", defaultLabel)}
      {modes.slice(half).map((m) => button(m.id, m.label))}
    </div>
  );
}
