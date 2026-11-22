import { useEffect, useState } from "react";

import { getCharacter, systemOf } from "../features/characters/api";
import {
  ruleScoreValues,
  ruleStartingScores,
  SCORE_CAP,
  scoreRuleProblems,
} from "../features/characters/creation";
import { derive } from "../features/characters/store";
import { roll } from "../features/dice/notation";
import type { Campaign } from "../campaign/campaign";
import type { ChoiceDef, GameSystem, ScoreMethods, ScoreRule } from "../systems/types";
import { Button } from "../ui/Button";
import { OptionPicker } from "../ui/OptionPicker";
import { closePopup } from "../ui/popup";
import { Segmented } from "../ui/Segmented";
import type { CharacterView } from "../features/characters/types";
import { usePopupDialog } from "./usePopupDialog";
import { Dialog } from "./Dialog";
import { planAdvancement  } from "./advancementModel";
import type {Improvement} from "./advancementModel";
import { bumpResource, setData, setScore } from "./commands/characters";
import { useCampaign } from "./campaignContext";
import {
  assignInOrder,
  emptyPick,
  pointsSpent,
  scoreMethods,
  startingScores,
} from "./creationModel";
import type { Picked, ScoreMethod } from "./creationModel";

export type { Picked, ScoreMethod } from "./creationModel";

/*
 * The guided flow's parts (design: core change 14): a choice with its
 * options' text and any stat boost to place; ability scores by standard
 * array, point buy or roll; and the advancement dialog, which asks for the
 * choices and improvements at the next system-defined rank.
 */

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
  const blockedStatSet = new Set(blockedStats);
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
            options={boost.amounts.map((a, index) => ({
              id: String(index),
              label: a
                .filter(Boolean)
                .map((n) => `+${n}`)
                .join(" "),
            }))}
            onChange={(v) => { onChange({ ...value, pattern: Number(v) }); }}
          />
          {amounts.map((n, index) =>
            n ? (
              <label key={n} className="creation-boost-pick">
                +{n}
                <select
                  value={value.order[index] ?? ""}
                  onChange={(e) => {
                    // Swap so each stat takes one amount.
                    const order = [...value.order];
                    const index_ = order.indexOf(e.currentTarget.value);
                    if (index_ !== -1) order[index_] = order[index] ?? e.currentTarget.value;
                    order[index] = e.currentTarget.value;
                    onChange({ ...value, order });
                  }}
                >
                  {boost.stats.map((s) => (
                    <option key={s} value={s} disabled={blockedStatSet.has(s)}>
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

/** Ability scores: assign a standard array or rolled set, spend a point buy, or type them in. */
export function ScoreFields({
  system,
  methods,
  method,
  onMethod,
  scores,
  onScores,
  rule,
  hint,
}: {
  system: GameSystem;
  methods: ScoreMethods;
  method: ScoreMethod;
  onMethod: (method: ScoreMethod) => void;
  scores: Record<string, number>;
  onScores: (scores: Record<string, number>) => void;
  rule?: ScoreRule | undefined;
  hint?: string | undefined;
}) {
  const { available, pool, choose, rollPool, spent, buyable } = useScoreFields(
    system,
    methods,
    onMethod,
    scores,
    onScores,
    rule,
  );
  if (rule)
    return (
      <div className="field creation-scores">
        <span>Ability scores</span>
        {hint && <p className="field-hint">{hint}</p>}
        <RuleScoreFields system={system} rule={rule} scores={scores} onScores={onScores} />
      </div>
    );

  return (
    <div className="field creation-scores">
      <span>Ability scores</span>
      {hint && <p className="field-hint">{hint}</p>}
      <Segmented label="Method" value={method} options={available} onChange={choose} />
      {method === "buy" && methods.pointBuy && (
        <span className="muted" data-over={spent === null || spent > methods.pointBuy.budget}>
          {spent ?? "–"} / {methods.pointBuy.budget} points
        </span>
      )}
      {method === "roll" && (
        <Button variant="ghost" onClick={rollPool}>
          Roll Again ({methods.roll})
        </Button>
      )}
      <div className="creation-score-grid">
        {system.stats.map((stat) => (
          <label key={stat.id} className="creation-score">
            <span className="stat-abbr">{stat.abbr}</span>
            {method === "array" || method === "roll" ? (
              <select
                value={scores[stat.id]}
                onChange={(event) => { onScores(swapScore(scores, stat.id, Number(event.currentTarget.value))); }
                }
              >
                {pool.map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={method === "buy" ? Math.min(...buyable) : (stat.min ?? 1)}
                max={method === "buy" ? Math.max(...buyable) : (stat.max ?? SCORE_CAP)}
                value={scores[stat.id]}
                onInput={(event) => { onScores({ ...scores, [stat.id]: Number(event.currentTarget.value) || 0 }); }
                }
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function useScoreFields(
  system: GameSystem,
  methods: ScoreMethods,
  onMethod: (method: ScoreMethod) => void,
  scores: Record<string, number>,
  onScores: (scores: Record<string, number>) => void,
  rule: ScoreRule | undefined,
) {
  const available = scoreMethods(methods);
  const [pool, setPool] = useState<number[]>(methods.standardArray ?? []);
  const takePool = (next: number[]) => {
    setPool(next);
    onScores(assignInOrder(system, next));
  };
  useEffect(() => {
    if (rule) onScores(ruleStartingScores(rule, system.stats));
    // Only a new rule resets the scores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule]);
  const rollPool = () => { takePool(system.stats.map(() => roll(methods.roll!).total).sort((a, b) => b - a)); };
  const choose = (m: ScoreMethod) => {
    onMethod(m);
    switch (m) {
    case "array": {
    takePool(methods.standardArray!);
    break;
    }
    case "buy": {
    onScores(startingScores(system, methods, m));
    break;
    }
    case "roll": { {
    rollPool();
    // No default
    }
    break;
    }
    }
  };
  const spent = methods.pointBuy ? pointsSpent(scores, methods.pointBuy) : null;
  const buyable = methods.pointBuy ? Object.keys(methods.pointBuy.costs).map(Number) : [];
  return { available, pool, choose, rollPool, spent, buyable };
}

/** A picker for each stat's score, checked against the class's required stat line. */
export function RuleScoreFields({
  system,
  rule,
  scores,
  onScores,
}: {
  system: GameSystem;
  rule: ScoreRule;
  scores: Record<string, number>;
  onScores: (scores: Record<string, number>) => void;
}) {
  const values = ruleScoreValues(rule);
  const problems = scoreRuleProblems(rule, system.stats, scores);
  return (
    <>
      <div className="creation-score-grid">
        {system.stats.map((stat) => (
          <label key={stat.id} className="creation-score">
            <span className="stat-abbr">{stat.abbr}</span>
            <select
              value={scores[stat.id] ?? ""}
              onChange={(event) => { onScores({ ...scores, [stat.id]: Number(event.currentTarget.value) }); }
              }
            >
              {values.map((value) => (
                <option key={value} value={value}>
                  {value > 0 ? `+${value}` : value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <ul className="creation-score-problems" aria-live="polite">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </>
  );
}

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
  const context = useCampaign();
  const reference = usePopupDialog();
  const system = systemOf(campaign);
  const c = getCharacter(campaign, characterId)!;
  const [picks, setPicks] = useState<Record<string, Picked>>({});
  const [improvement, setImprovement] = useState<Improvement>({
    kind: "two",
    first: system.stats[0]!.id,
    second: system.stats[1]!.id,
    feat: "",
  });
  const plan = planAdvancement(system, c, picks, improvement);

  const apply = () => {
    const before = derive(c, system).values["maxHp"] ?? 0;
    context.commands.batch(() => {
      for (const [key, value] of plan.data) context.execute(setData, { id: c.id, key, value });
      for (const [stat, score] of plan.scores) context.execute(setScore, { id: c.id, stat, score });
    });
    const d = derive(getCharacter(campaign, c.id)!, system);
    const gained = (d.values["maxHp"] ?? 0) - before;
    if (gained > 0)
      context.execute(bumpResource, { id: c.id, resource: "hp", by: gained, max: d.values["maxHp"] });
    if (system.resources.some((r) => r.id === "hitDice"))
      context.execute(bumpResource, {
        id: c.id,
        resource: "hitDice",
        by: 1,
        max: d.values["hitDiceMax"],
      });
    closePopup(reference.current, onClose);
  };

  return (
    <Dialog dialogRef={reference} title={`${c.name}: Advancement ${plan.rank}`} onClose={onClose}>
      <form
        className="creation-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (plan.ready) apply();
        }}
      >
        {plan.choices.map((ch) => (
          <ChoiceField
            key={ch.id}
            system={system}
            choice={ch.at === "advance" ? { ...ch, label: `${ch.label} ${plan.rank}` } : ch}
            value={picks[ch.id] ?? emptyPick()}
            blockedStats={plan.blockedStats}
            onChange={(p) => { setPicks({ ...picks, [ch.id]: p }); }}
          />
        ))}
        {plan.improves && (
          <ImprovementFields
            system={system}
            character={c}
            value={improvement}
            onChange={setImprovement}
          />
        )}
        {plan.choices.length === 0 && !plan.improves && (
          <p className="muted">Hit points and Hit Dice go up.</p>
        )}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => { closePopup(reference.current, onClose); }}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!plan.ready}>
            Level Up
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** How an advancement raises ability scores: +2 to one, +1 to two, or a feat. */
function ImprovementFields({
  system,
  character: c,
  value,
  onChange,
}: {
  system: GameSystem;
  character: CharacterView;
  value: Improvement;
  onChange: (value: Improvement) => void;
}) {
  const feats = system.creation?.feats;
  const statSelect = (stat: string, set: (id: string) => void, label: string) => (
    <select aria-label={label} value={stat} onChange={(e) => { set(e.currentTarget.value); }}>
      {system.stats.map((s) => (
        <option key={s.id} value={s.id} disabled={(c.scores[s.id] ?? 10) >= (s.max ?? SCORE_CAP)}>
          {s.name} ({c.scores[s.id]})
        </option>
      ))}
    </select>
  );
  const feat = value.kind === "feat" && feats ? feats : undefined;
  return (
    <div className="field">
      Ability Score Improvement
      <Segmented
        label="Improvement"
        value={value.kind}
        options={[
          { id: "two", label: "+2 to one" },
          { id: "split", label: "+1 to two" },
          ...(feats ? [{ id: "feat" as const, label: "A feat" }] : []),
        ]}
        onChange={(kind) => { onChange({ ...value, kind }); }}
      />
      {feat ? (
        <>
          <select
            aria-label="Feat"
            value={value.feat}
            onChange={(e) => { onChange({ ...value, feat: e.currentTarget.value }); }}
          >
            <option value="">Choose…</option>
            {feat.options.map((o) => (
              <option key={o.id} value={o.id} title={o.text}>
                {o.name}
              </option>
            ))}
          </select>
          {value.feat && (
            <p className="muted">{feat.options.find((o) => o.id === value.feat)?.text}</p>
          )}
        </>
      ) : (
        <div className="sheet-row">
          {statSelect(value.first, (first) => { onChange({ ...value, first }); }, "First ability")}
          {value.kind === "split" &&
            statSelect(value.second, (second) => { onChange({ ...value, second }); }, "Second ability")}
        </div>
      )}
    </div>
  );
}
