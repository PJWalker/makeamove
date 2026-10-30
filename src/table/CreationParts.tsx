import { useSignal, type Signal } from "@preact/signals";
import {
  bumpResource,
  getCharacter,
  setData,
  setField,
  setScore,
  systemOf,
} from "../characters/api";
import {
  boostFrom,
  choicesAt,
  dataFrom,
  flatScores,
  pointsSpent,
  raise,
  SCORE_CAP,
} from "../characters/creation";
import { derive } from "../characters/store";
import { roll } from "../dice/notation";
import type { Campaign } from "../store/campaign";
import type { ChoiceDef, GameSystem, ScoreMethods } from "../systems/types";
import { Button } from "../ui/Button";
import { usePopupDialog } from "./usePopupDialog";
import { Segmented } from "../ui/Segmented";
import { Dialog } from "./CampaignDialogs";

/*
 * The guided flow's parts (design: core change 14): a choice with its
 * options' text and any stat boost to place; ability scores by standard
 * array, point buy or roll; and the level-up dialog, which asks for the
 * choices and improvements the new level brings.
 */

/** What's been picked for one choice, and how its boost is placed. */
export interface Picked {
  option: string;
  /** Index into the option's boost amounts. */
  pattern: number;
  /** Stats in the order the pattern's amounts go to. */
  order: string[];
}

export const emptyPick = (): Picked => ({ option: "", pattern: 0, order: [] });

/** One choice: a select of its options, the chosen one's text, and where its boost goes. */
export function ChoiceField({
  system,
  choice,
  value,
  onChange,
}: {
  system: GameSystem;
  choice: ChoiceDef;
  value: Picked;
  onChange: (p: Picked) => void;
}) {
  const option = choice.options.find((o) => o.id === value.option);
  const boost = option?.boost;
  const amounts = boost?.amounts[value.pattern] ?? [];
  const statName = (id: string) =>
    system.stats.find((s) => s.id === id)?.abbr ?? id;
  return (
    <div class="field creation-choice">
      <label class="field">
        {choice.label}
        <select
          class="input bevel"
          value={value.option}
          onChange={(e) => {
            const o = choice.options.find(
              (x) => x.id === e.currentTarget.value,
            );
            onChange({
              option: e.currentTarget.value,
              pattern: 0,
              order: o?.boost?.stats.slice() ?? [],
            });
          }}
        >
          <option value="">Choose…</option>
          {choice.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {option && <p class="muted creation-text">{option.text}</p>}
      {boost && (
        <div class="creation-boost">
          <Segmented
            label="Increase"
            value={String(value.pattern)}
            options={boost.amounts.map((a, i) => ({
              id: String(i),
              label: a
                .filter(Boolean)
                .map((n) => `+${n}`)
                .join(" "),
            }))}
            onChange={(v) => onChange({ ...value, pattern: Number(v) })}
          />
          {amounts.map((n, i) =>
            n ? (
              <label key={i} class="creation-boost-pick">
                +{n}
                <select
                  class="input bevel"
                  value={value.order[i]}
                  onChange={(e) => {
                    // Swap so each stat takes one amount.
                    const order = value.order.slice();
                    const j = order.indexOf(e.currentTarget.value);
                    if (j >= 0) order[j] = order[i];
                    order[i] = e.currentTarget.value;
                    onChange({ ...value, order });
                  }}
                >
                  {boost.stats.map((s) => (
                    <option key={s} value={s}>
                      {statName(s)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

export type ScoreMethod = "array" | "buy" | "roll" | "manual";

/** The methods a system offers, first the one to start with. */
export const scoreMethods = (
  methods: ScoreMethods,
): { id: ScoreMethod; label: string }[] => [
  ...(methods.standardArray
    ? [{ id: "array" as const, label: "Standard array" }]
    : []),
  ...(methods.pointBuy ? [{ id: "buy" as const, label: "Point buy" }] : []),
  ...(methods.roll ? [{ id: "roll" as const, label: "Roll" }] : []),
  { id: "manual", label: "Manual" },
];

/** The scores a method starts from. */
export const startingScores = (
  system: GameSystem,
  methods: ScoreMethods,
  method: ScoreMethod,
) =>
  method === "array" && methods.standardArray
    ? assignInOrder(system, methods.standardArray)
    : flatScores(system, method === "buy" ? 8 : 10);

/** Ability scores: assign a standard array or rolled set, spend a point buy, or type them in. */
export function ScoreFields({
  system,
  methods,
  method,
  scores,
}: {
  system: GameSystem;
  methods: ScoreMethods;
  method: Signal<ScoreMethod>;
  scores: Signal<Record<string, number>>;
}) {
  const available = scoreMethods(methods);
  const pool = useSignal<number[]>(methods.standardArray ?? []);
  const choose = (m: ScoreMethod) => {
    method.value = m;
    if (m === "array") {
      pool.value = methods.standardArray!;
      scores.value = assignInOrder(system, pool.value);
    } else if (m === "buy") scores.value = flatScores(system, 8);
    else if (m === "roll") rollPool();
  };
  const rollPool = () => {
    pool.value = system.stats
      .map(() => roll(methods.roll!).total)
      .sort((a, b) => b - a);
    scores.value = assignInOrder(system, pool.value);
  };
  const spent = methods.pointBuy
    ? pointsSpent(scores.value, methods.pointBuy)
    : null;
  const buyable = methods.pointBuy
    ? Object.keys(methods.pointBuy.costs).map(Number)
    : [];

  return (
    <div class="field creation-scores">
      <span>Ability scores</span>
      <Segmented
        label="Method"
        value={method.value}
        options={available}
        onChange={choose}
      />
      {method.value === "buy" && methods.pointBuy && (
        <span
          class="muted"
          data-over={spent === null || spent > methods.pointBuy.budget}
        >
          {spent ?? "–"} / {methods.pointBuy.budget} points
        </span>
      )}
      {method.value === "roll" && (
        <Button size="sm" variant="ghost" onClick={rollPool}>
          Roll again ({methods.roll})
        </Button>
      )}
      <div class="creation-score-grid">
        {system.stats.map((s) => (
          <label key={s.id} class="creation-score">
            <span class="stat-abbr">{s.abbr}</span>
            {method.value === "array" || method.value === "roll" ? (
              <select
                class="input bevel"
                value={scores.value[s.id]}
                onChange={(e) =>
                  (scores.value = swapScore(
                    scores.value,
                    s.id,
                    Number(e.currentTarget.value),
                  ))
                }
              >
                {pool.value.map((n, i) => (
                  <option key={i} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                class="input bevel"
                type="number"
                min={method.value === "buy" ? Math.min(...buyable) : 1}
                max={method.value === "buy" ? Math.max(...buyable) : SCORE_CAP}
                value={scores.value[s.id]}
                onInput={(e) =>
                  (scores.value = {
                    ...scores.value,
                    [s.id]: Number(e.currentTarget.value) || 0,
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Whether the scores are ready: a point buy must be within budget. */
export function scoresReady(
  methods: ScoreMethods,
  method: ScoreMethod,
  scores: Record<string, number>,
): boolean {
  if (method !== "buy" || !methods.pointBuy) return true;
  const spent = pointsSpent(scores, methods.pointBuy);
  return spent !== null && spent <= methods.pointBuy.budget;
}

/** The pool's values to the stats in order, best first. */
const assignInOrder = (system: GameSystem, pool: number[]) =>
  Object.fromEntries(system.stats.map((s, i) => [s.id, pool[i] ?? 10]));

/** Give a stat a value from the pool, swapping with the stat that had it. */
function swapScore(
  scores: Record<string, number>,
  stat: string,
  value: number,
): Record<string, number> {
  const other = Object.keys(scores).find(
    (k) => k !== stat && scores[k] === value,
  );
  return {
    ...scores,
    [stat]: value,
    ...(other ? { [other]: scores[stat] } : {}),
  };
}

/** What the guided creation form hands to newCharacter: scores with boosts, and the data its choices write. */
export function creationResult(
  system: GameSystem,
  classId: string,
  scores: Record<string, number>,
  picks: Record<string, Picked>,
) {
  const choices = choicesAt(system.creation, "create", classId);
  let raised = scores;
  for (const c of choices) {
    const p = picks[c.id];
    if (p)
      raised = raise(
        raised,
        boostFrom(
          c.options.find((o) => o.id === p.option),
          p.pattern,
          p.order,
        ),
      );
  }
  const data = dataFrom(
    choices,
    Object.fromEntries(Object.entries(picks).map(([k, p]) => [k, p.option])),
    listFieldsOf(system),
  );
  return { scores: raised, data };
}

/** Data fields that gather several picks (5.5e's feats). */
const listFieldsOf = (system: GameSystem) =>
  system.creation?.feats ? [system.creation.feats.field] : [];

/**
 * Level up: the new level's choices (a subclass), and at improvement levels
 * either +2 to one stat or +1 to two, or a feat. Hit points rise by the
 * difference in the maximum.
 */
export function LevelUpDialog({
  campaign,
  characterId,
  onClose,
}: {
  campaign: Campaign;
  characterId: string;
  onClose: () => void;
}) {
  const ref = usePopupDialog();
  const system = systemOf(campaign);
  const c = getCharacter(campaign, characterId)!;
  const level = c.level + 1;
  const choices = choicesAt(system.creation, level, c.classId);
  const improves = !!system.creation?.improvementLevels?.includes(level);
  const picks = useSignal<Record<string, Picked>>({});
  const improvement = useSignal<"two" | "split" | "feat">("two");
  const first = useSignal(system.stats[0].id);
  const second = useSignal(system.stats[1].id);
  const feat = useSignal("");
  const featChoice = system.creation?.feats;
  const ready =
    choices.every((ch) => picks.value[ch.id]?.option) &&
    (!improves || improvement.value !== "feat" || !!feat.value);

  const apply = () => {
    const before = derive(c, system).values.maxHp ?? 0;
    campaign.doc.transact(() => {
      setField(campaign, c.id, "level", level);
      const data = dataFrom(
        choices,
        Object.fromEntries(
          Object.entries(picks.value).map(([k, p]) => [k, p.option]),
        ),
      );
      for (const [k, v] of Object.entries(data)) setData(campaign, c.id, k, v);
      if (improves) {
        if (improvement.value === "feat" && featChoice) {
          const now = String(c.data[featChoice.field] ?? "");
          setData(
            campaign,
            c.id,
            featChoice.field,
            now ? `${now},${feat.value}` : feat.value,
          );
        } else {
          const by =
            improvement.value === "two"
              ? { [first.value]: 2 }
              : { [first.value]: 1, [second.value]: 1 };
          const scores = raise(c.scores, by);
          for (const [k, v] of Object.entries(scores))
            if (v !== c.scores[k]) setScore(campaign, c.id, k, v);
        }
      }
    });
    const after = getCharacter(campaign, c.id)!;
    const d = derive(after, system);
    const gained = (d.values.maxHp ?? 0) - before;
    if (gained > 0) bumpResource(campaign, c.id, "hp", gained, d.values.maxHp);
    if (system.resources.some((r) => r.id === "hitDice"))
      bumpResource(campaign, c.id, "hitDice", 1, d.values.hitDiceMax);
    ref.current?.close();
  };

  const statSelect = (sig: Signal<string>, label: string) => (
    <select
      class="input bevel"
      aria-label={label}
      value={sig.value}
      onChange={(e) => (sig.value = e.currentTarget.value)}
    >
      {system.stats.map((s) => (
        <option
          key={s.id}
          value={s.id}
          disabled={(c.scores[s.id] ?? 10) >= SCORE_CAP}
        >
          {s.name} ({c.scores[s.id]})
        </option>
      ))}
    </select>
  );

  return (
    <Dialog
      dialogRef={ref}
      title={`${c.name}: level ${level}`}
      onClose={onClose}
    >
      <form
        class="creation-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) apply();
        }}
      >
        {choices.map((ch) => (
          <ChoiceField
            key={ch.id}
            system={system}
            choice={ch}
            value={picks.value[ch.id] ?? emptyPick()}
            onChange={(p) => (picks.value = { ...picks.value, [ch.id]: p })}
          />
        ))}
        {improves && (
          <div class="field">
            Ability Score Improvement
            <Segmented
              label="Improvement"
              value={improvement.value}
              options={[
                { id: "two", label: "+2 to one" },
                { id: "split", label: "+1 to two" },
                ...(featChoice
                  ? [{ id: "feat" as const, label: "A feat" }]
                  : []),
              ]}
              onChange={(v) => (improvement.value = v)}
            />
            {improvement.value === "feat" && featChoice ? (
              <select
                class="input bevel"
                aria-label="Feat"
                value={feat.value}
                onChange={(e) => (feat.value = e.currentTarget.value)}
              >
                <option value="">Choose…</option>
                {featChoice.options.map((o) => (
                  <option key={o.id} value={o.id} title={o.text}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <div class="sheet-row">
                {statSelect(first, "First ability")}
                {improvement.value === "split" &&
                  statSelect(second, "Second ability")}
              </div>
            )}
            {improvement.value === "feat" && feat.value && (
              <p class="muted">
                {featChoice?.options.find((o) => o.id === feat.value)?.text}
              </p>
            )}
          </div>
        )}
        {!choices.length && !improves && (
          <p class="muted">Hit points and Hit Dice go up.</p>
        )}
        <div class="form-actions">
          <Button variant="ghost" onClick={() => ref.current?.close()}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!ready}>
            Level up
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
