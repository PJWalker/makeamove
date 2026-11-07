import { useEffect, useState } from "react";

import {
  bumpResource,
  getCharacter,
  setData,
  setScore,
  systemOf,
} from "../features/characters/api";
import {
  boostFrom,
  choicesAt,
  dataFrom,
  pointsSpent,
  raise,
  SCORE_CAP,
  validBoost,
  previewChoices,
} from "../features/characters/creation";
import { derive } from "../features/characters/store";
import { roll } from "../features/dice/notation";
import { formatCommaList, parseCommaList } from "../lib/list";
import type { Campaign } from "../campaign/campaign";
import type { ChoiceDef, GameSystem, ScoreAssignmentOption, ScoreMethods } from "../systems/types";
import { Button } from "../ui/Button";
import { OptionPicker } from "../ui/OptionPicker";
import { closePopup } from "../ui/popup";
import { usePopupDialog } from "./usePopupDialog";
import { Segmented } from "../ui/Segmented";
import { Dialog } from "./CampaignDialogs";

/*
 * The guided flow's parts (design: core change 14): a choice with its
 * options' text and any stat boost to place; ability scores by standard
 * array, point buy or roll; and the advancement dialog, which asks for the
 * choices and improvements at the next system-defined rank.
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
  blockedStats = [],
}: {
  system: GameSystem;
  choice: ChoiceDef;
  value: Picked;
  onChange: (p: Picked) => void;
  blockedStats?: string[];
}) {
  const option = choice.options.find((o) => o.id === value.option);
  const boost = option?.boost;
  const amounts = boost?.amounts[value.pattern] ?? [];
  const statName = (id: string) => system.stats.find((s) => s.id === id)?.abbr ?? id;
  return (
    <div className="field creation-choice">
      <OptionPicker
        label={choice.label}
        options={choice.options}
        value={value.option}
        emptyLabel="Choose…"
        onChange={(id) => {
          const o = choice.options.find((x) => x.id === id);
          onChange({
            option: id,
            pattern: 0,
            order: o?.boost?.stats.slice() ?? [],
          });
        }}
      />
      {boost && (
        <div className="creation-boost">
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
              <label key={i} className="creation-boost-pick">
                +{n}
                <select
                  value={value.order[i] ?? ""}
                  onChange={(e) => {
                    // Swap so each stat takes one amount.
                    const order = value.order.slice();
                    const j = order.indexOf(e.currentTarget.value);
                    if (j >= 0) order[j] = order[i] ?? e.currentTarget.value;
                    order[i] = e.currentTarget.value;
                    onChange({ ...value, order });
                  }}
                >
                  {boost.stats.map((s) => (
                    <option key={s} value={s} disabled={blockedStats.includes(s)}>
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
export const scoreMethods = (methods: ScoreMethods): { id: ScoreMethod; label: string }[] => [
  ...(methods.standardArray ? [{ id: "array" as const, label: "Standard array" }] : []),
  ...(methods.pointBuy ? [{ id: "buy" as const, label: "Point buy" }] : []),
  ...(methods.roll ? [{ id: "roll" as const, label: "Roll" }] : []),
  { id: "manual", label: "Manual" },
];

/** The scores a method starts from. */
export const startingScores = (system: GameSystem, methods: ScoreMethods, method: ScoreMethod) =>
  method === "array" && methods.standardArray
    ? assignInOrder(system, methods.standardArray)
    : Object.fromEntries(
        system.stats.map((stat) => [
          stat.id,
          method === "buy" && methods.pointBuy
            ? Math.min(...Object.keys(methods.pointBuy.costs).map(Number))
            : (stat.default ?? 10),
        ]),
      );

/** Ability scores: assign a standard array or rolled set, spend a point buy, or type them in. */
export function ScoreFields({
  system,
  methods,
  method,
  onMethod,
  scores,
  onScores,
  assignments,
}: {
  system: GameSystem;
  methods: ScoreMethods;
  method: ScoreMethod;
  onMethod: (method: ScoreMethod) => void;
  scores: Record<string, number>;
  onScores: (scores: Record<string, number>) => void;
  assignments?: ScoreAssignmentOption[];
}) {
  const available = scoreMethods(methods);
  const [pool, setPool] = useState<number[]>(methods.standardArray ?? []);
  const [assignmentId, setAssignmentId] = useState(assignments?.[0]?.id ?? "");
  const takePool = (next: number[]) => {
    setPool(next);
    onScores(assignInOrder(system, next));
  };
  useEffect(() => {
    const initial = assignments?.[0];
    if (!initial) return;
    setAssignmentId(initial.id);
    onScores({ ...initial.scores });
    // Only a new set of assignments resets the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);
  const rollPool = () =>
    takePool(system.stats.map(() => roll(methods.roll!).total).sort((a, b) => b - a));
  const choose = (m: ScoreMethod) => {
    onMethod(m);
    if (m === "array") takePool(methods.standardArray!);
    else if (m === "buy") onScores(startingScores(system, methods, m));
    else if (m === "roll") rollPool();
  };
  const spent = methods.pointBuy ? pointsSpent(scores, methods.pointBuy) : null;
  const buyable = methods.pointBuy ? Object.keys(methods.pointBuy.costs).map(Number) : [];

  if (assignments?.length) {
    const selected =
      assignments.find((option) => option.id === assignmentId) ?? assignments[0]!;
    return (
      <div className="field creation-scores">
        <span>Ability scores</span>
        <OptionPicker
          label="Class-guided assignment"
          options={assignments}
          value={selected.id}
          onChange={(id) => {
            const option = assignments.find((entry) => entry.id === id);
            if (!option) return;
            setAssignmentId(option.id);
            onScores({ ...option.scores });
          }}
        />
        <div className="creation-score-grid">
          {system.stats.map((stat) => (
            <label key={stat.id} className="creation-score">
              <span className="stat-abbr">{stat.abbr}</span>
              <output>{selected.scores[stat.id] ?? 0}</output>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="field creation-scores">
      <span>Ability scores</span>
      <Segmented label="Method" value={method} options={available} onChange={choose} />
      {method === "buy" && methods.pointBuy && (
        <span className="muted" data-over={spent === null || spent > methods.pointBuy.budget}>
          {spent ?? "–"} / {methods.pointBuy.budget} points
        </span>
      )}
      {method === "roll" && (
        <Button size="sm" variant="ghost" onClick={rollPool}>
          Roll again ({methods.roll})
        </Button>
      )}
      <div className="creation-score-grid">
        {system.stats.map((s) => (
          <label key={s.id} className="creation-score">
            <span className="stat-abbr">{s.abbr}</span>
            {method === "array" || method === "roll" ? (
              <select
                value={scores[s.id]}
                onChange={(e) => onScores(swapScore(scores, s.id, Number(e.currentTarget.value)))}
              >
                {pool.map((n, i) => (
                  <option key={i} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={method === "buy" ? Math.min(...buyable) : (s.min ?? 1)}
                max={method === "buy" ? Math.max(...buyable) : (s.max ?? SCORE_CAP)}
                value={scores[s.id]}
                onInput={(e) => onScores({ ...scores, [s.id]: Number(e.currentTarget.value) || 0 })}
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
  const other = Object.keys(scores).find((k) => k !== stat && scores[k] === value);
  return {
    ...scores,
    [stat]: value,
    ...(other ? { [other]: scores[stat] ?? value } : {}),
  };
}

/** What the guided creation form hands to newCharacter: scores with boosts, and the data its choices write. */
export function creationResult(
  system: GameSystem,
  scores: Record<string, number>,
  picks: Record<string, Picked>,
) {
  const pickedOptions = Object.fromEntries(
    Object.entries(picks).map(([id, pick]) => [id, pick.option]),
  );
  const pickedData: Record<string, string | number | boolean> = {};
  for (const choice of system.creation?.choices ?? []) {
    const option = choice.options.find((item) => item.id === pickedOptions[choice.id]);
    if (!option) continue;
    pickedData[choice.field] = option.id;
    Object.assign(pickedData, option.grants);
  }
  const choices = choicesAt(system.creation, "create", pickedData);
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
        Object.fromEntries(system.stats.map((stat) => [stat.id, stat.max ?? SCORE_CAP])),
      );
  }
  const data = dataFrom(choices, pickedOptions, listFieldsOf(system));
  return { scores: raised, data };
}

/** Data fields that gather several picks (5.5e's feats). */
const listFieldsOf = (system: GameSystem) => [
  ...(system.creation?.listFields ?? []),
  ...(system.creation?.feats ? [system.creation.feats.field] : []),
];

/** Each stat's highest score. */
export const scoreCapsOf = (system: GameSystem) =>
  Object.fromEntries(system.stats.map((stat) => [stat.id, stat.max ?? SCORE_CAP]));

/** Choices and improvements at the next system-defined advancement point. */
export function AdvancementDialog({
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
  const field = system.creation?.advancementField;
  const rank = Number(field ? c.data[field] : 1) + 1;
  const [picks, setPicks] = useState<Record<string, Picked>>({});
  const choices = previewChoices(
    system.creation,
    rank,
    c.data,
    c.scores,
    Object.fromEntries(Object.entries(picks).map(([id, picked]) => [id, picked.option])),
  );
  const improves = !!system.creation?.improvementsAt?.includes(rank);
  const [improvement, setImprovement] = useState<"two" | "split" | "feat">("two");
  const [first, setFirst] = useState(system.stats[0]!.id);
  const [second, setSecond] = useState(system.stats[1]!.id);
  const [feat, setFeat] = useState("");
  const featChoice = system.creation?.feats;
  const markedStatsField = system.creation?.markedStatsField;
  const resetsMarks = !!system.creation?.resetMarkedStatsAt?.includes(rank);
  const blockedStats =
    markedStatsField && !resetsMarks
      ? parseCommaList(String(c.data[markedStatsField] ?? "")).filter(Boolean)
      : [];
  const optionalChoices = choices.filter((choice) => choice.optional);
  const advancementCost = optionalChoices.reduce((cost, choice) => {
    const option = choice.options.find((item) => item.id === picks[choice.id]?.option);
    return cost + (option ? (option.cost ?? 1) : 0);
  }, 0);
  const ready =
    choices.filter((ch) => !ch.optional).every((ch) => picks[ch.id]?.option) &&
    choices.every((choice) => {
      const pick = picks[choice.id];
      return (
        !pick?.option ||
        validBoost(
          choice.options.find((option) => option.id === pick.option),
          pick.pattern,
          pick.order,
          c.scores,
          scoreCapsOf(system),
          blockedStats,
        )
      );
    }) &&
    advancementCost === (system.creation?.choicesPerAdvancement ?? 0) &&
    (!improves || improvement !== "feat" || !!feat);

  const apply = () => {
    const before = derive(c, system).values.maxHp ?? 0;
    campaign.doc.transact(() => {
      if (field) setData(campaign, c.id, field, rank);
      let advancedScores = c.scores;
      const markedStats = new Set(resetsMarks ? [] : blockedStats);
      for (const choice of choices) {
        const picked = picks[choice.id];
        if (!picked?.option) continue;
        const option = choice.options.find((item) => item.id === picked.option);
        if (option?.boost) {
          advancedScores = raise(
            advancedScores,
            boostFrom(option, picked.pattern, picked.order),
            scoreCapsOf(system),
          );
          const amounts = option.boost.amounts[picked.pattern] ?? [];
          amounts.forEach((amount, index) => {
            if (amount && picked.order[index]) markedStats.add(picked.order[index]);
          });
        }
      }
      const data = dataFrom(
        choices,
        Object.fromEntries(Object.entries(picks).map(([k, p]) => [k, p.option])),
        listFieldsOf(system),
        c.data,
      );
      for (const [k, v] of Object.entries(data)) {
        const value = listFieldsOf(system).includes(k) && c.data[k] ? `${c.data[k]},${v}` : v;
        setData(campaign, c.id, k, value);
      }
      if (system.creation?.advancementCounterField)
        setData(campaign, c.id, system.creation.advancementCounterField, 0);
      if (improves) {
        if (improvement === "feat" && featChoice) {
          const now = String(c.data[featChoice.field] ?? "");
          setData(campaign, c.id, featChoice.field, now ? `${now},${feat}` : feat);
        } else {
          const by =
            improvement === "two"
              ? { [first]: 2 }
              : { [first]: 1, [second]: 1 };
          advancedScores = raise(advancedScores, by, scoreCapsOf(system));
        }
      }
      for (const [k, v] of Object.entries(advancedScores))
        if (v !== c.scores[k]) setScore(campaign, c.id, k, v);
      if (markedStatsField)
        setData(campaign, c.id, markedStatsField, formatCommaList([...markedStats]));
    });
    const after = getCharacter(campaign, c.id)!;
    const d = derive(after, system);
    const gained = (d.values.maxHp ?? 0) - before;
    if (gained > 0) bumpResource(campaign, c.id, "hp", gained, d.values.maxHp);
    if (system.resources.some((r) => r.id === "hitDice"))
      bumpResource(campaign, c.id, "hitDice", 1, d.values.hitDiceMax);
    closePopup(ref.current, onClose);
  };

  const statSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      {system.stats.map((s) => (
        <option key={s.id} value={s.id} disabled={(c.scores[s.id] ?? 10) >= (s.max ?? SCORE_CAP)}>
          {s.name} ({c.scores[s.id]})
        </option>
      ))}
    </select>
  );

  return (
    <Dialog dialogRef={ref} title={`${c.name}: advancement ${rank}`} onClose={onClose}>
      <form
        className="creation-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) apply();
        }}
      >
        {choices.map((ch) => (
          <ChoiceField
            key={ch.id}
            system={system}
            choice={ch.at === "advance" ? { ...ch, label: `${ch.label} ${rank}` } : ch}
            value={picks[ch.id] ?? emptyPick()}
            blockedStats={blockedStats}
            onChange={(p) => setPicks({ ...picks, [ch.id]: p })}
          />
        ))}
        {improves && (
          <div className="field">
            Ability Score Improvement
            <Segmented
              label="Improvement"
              value={improvement}
              options={[
                { id: "two", label: "+2 to one" },
                { id: "split", label: "+1 to two" },
                ...(featChoice ? [{ id: "feat" as const, label: "A feat" }] : []),
              ]}
              onChange={(v) => setImprovement(v)}
            />
            {improvement === "feat" && featChoice ? (
              <select
                aria-label="Feat"
                value={feat}
                onChange={(e) => setFeat(e.currentTarget.value)}
              >
                <option value="">Choose…</option>
                {featChoice.options.map((o) => (
                  <option key={o.id} value={o.id} title={o.text}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="sheet-row">
                {statSelect(first, setFirst, "First ability")}
                {improvement === "split" && statSelect(second, setSecond, "Second ability")}
              </div>
            )}
            {improvement === "feat" && feat && (
              <p className="muted">{featChoice?.options.find((o) => o.id === feat)?.text}</p>
            )}
          </div>
        )}
        {!choices.length && !improves && <p className="muted">Hit points and Hit Dice go up.</p>}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => closePopup(ref.current, onClose)}>
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
