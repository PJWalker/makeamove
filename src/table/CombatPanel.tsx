import { useState } from "react";
import { getCharacter, systemOf } from "../features/characters/api";
import { derive } from "../features/characters/store";
import { roundOf, turnOf, turnOrder, type CombatantView } from "../features/combat/combat";
import { combatMaps } from "../features/combat/api";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { PanelActions } from "./PanelActions";
import {
  IconClose,
  IconDice,
  IconEndCombat,
  IconNextTurn,
  IconPreviousTurn,
  IconReveal,
  IconSecret,
  IconStartCombat,
} from "../ui/icons";
import { CONCENTRATION_COLOUR, conditionColour } from "../features/combat/pipColours";
import { can } from "../workspace/commands/views";
import { useCampaign } from "../workspace/campaignContext";
import {
  endCombat,
  hideCombatant,
  nextTurn,
  previousCombatTurn,
  removeFromCombat,
  removeTimedCondition,
  rollCombatantInitiative,
  rollForNpcs,
  setInitiative,
  startCombat,
  stopConcentrating,
  timeCondition,
} from "../workspace/commands/combat";

/*
 * The turn tracker: who's in the fight, in initiative order, whose turn it
 * is and the round. The GM runs it; players roll their own initiative and
 * see everyone the GM hasn't hidden. Each row shows the combatant's
 * conditions, with rounds left for timed ones, and any concentration.
 */

export function CombatPanel({ campaign }: { campaign: Campaign }) {
  const ctx = useCampaign();
  // Running the fight is the GM's: what the controls show follows who may run them.
  const gm = useQuery(campaign.members, () => can(ctx, startCombat, undefined));
  const state = useQuery(
    campaign.combat,
    () => `${roundOf(combatMaps(campaign))}|${turnOf(combatMaps(campaign)) ?? ""}`,
  );
  const [roundText, turn] = state.split("|");
  const round = Number(roundText);
  const order = useQuery(campaign.combatants, () => JSON.stringify(turnOrder(campaign.combatants)));
  const all = JSON.parse(order) as CombatantView[];
  const shown = gm ? all : all.filter((c) => !c.hidden);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="combat-panel">
      <PanelActions>
        <span className="combat-round">{round ? `Round ${round}` : "Not started"}</span>
        {gm && (
          <span className="combat-controls">
            {round > 0 ? (
              <>
                <Button
                  variant="ghost"
                  icon={IconPreviousTurn}
                  onClick={() => ctx.execute(previousCombatTurn, undefined)}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  icon={IconNextTurn}
                  disabled={!all.length}
                  onClick={() => ctx.execute(nextTurn, undefined)}
                >
                  Next Turn
                </Button>
                <Button
                  variant="ghost"
                  icon={IconEndCombat}
                  onClick={() => ctx.execute(endCombat, undefined)}
                >
                  End
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  icon={IconDice}
                  disabled={!all.some((c) => c.init === null)}
                  onClick={() => void ctx.execute(rollForNpcs, undefined)}
                >
                  Roll for NPCs
                </Button>
                <Button
                  variant="primary"
                  icon={IconStartCombat}
                  disabled={!all.length}
                  onClick={() => ctx.execute(startCombat, undefined)}
                >
                  Start
                </Button>
              </>
            )}
          </span>
        )}
      </PanelActions>
      {shown.length ? (
        <ol className="combat-list">
          {shown.map((c) => (
            <CombatRow
              key={c.id}
              campaign={campaign}
              c={c}
              current={c.id === turn}
              gm={gm}
              open={open === c.id}
              onToggle={() => setOpen(open === c.id ? null : c.id)}
              turn={turn || null}
              everyone={all}
            />
          ))}
        </ol>
      ) : (
        <p className="combat-empty muted">
          {gm ? "Select tokens, then right-click: Add to combat." : "No fight yet."}
        </p>
      )}
    </div>
  );
}

function CombatRow({
  campaign,
  c,
  current,
  gm,
  open,
  onToggle,
  turn,
  everyone,
}: {
  campaign: Campaign;
  c: CombatantView;
  current: boolean;
  gm: boolean;
  open: boolean;
  onToggle: () => void;
  turn: string | null;
  everyone: CombatantView[];
}) {
  const ctx = useCampaign();
  const system = systemOf(campaign);
  // Re-render when the character changes (HP, conditions).
  useQuery(campaign.characters, () =>
    JSON.stringify(getCharacter(campaign, c.characterId) ?? null),
  );
  const ch = getCharacter(campaign, c.characterId);
  // Their player or the GM: whoever may change their initiative.
  const mine = can(ctx, setInitiative, { id: c.id, init: null });
  const hp = ch ? (ch.resources.hp ?? 0) : null;
  const maxHp = ch ? derive(ch, system).values.maxHp : null;
  const concentration = ch?.concentration
    ? system.actions.find((a) => a.id === ch.concentration)?.name
    : undefined;
  const setInit = (v: string) =>
    ctx.execute(setInitiative, { id: c.id, init: v === "" ? null : Number(v) });

  return (
    <li
      className="combat-row"
      data-current={current || undefined}
      data-hidden={c.hidden || undefined}
    >
      <div className="combat-main">
        {mine ? (
          <input
            className="combat-init"
            type="number"
            aria-label={`${c.name} initiative`}
            value={c.init ?? ""}
            onChange={(e) => setInit(e.currentTarget.value)}
          />
        ) : (
          <span className="combat-init">{c.init ?? "–"}</span>
        )}
        <button type="button" className="combat-name" onClick={onToggle} aria-expanded={open}>
          {c.name}
          {hp !== null && gm && (
            <span className="muted">
              {" "}
              {hp}/{maxHp}
            </span>
          )}
        </button>
        {c.init === null && mine && (
          <Button
            variant="icon"
            label="Roll initiative"
            onClick={() => ctx.execute(rollCombatantInitiative, { id: c.id })}
          >
            <IconDice />
          </Button>
        )}
        {gm && (
          <>
            <Button
              variant="icon"
              label={c.hidden ? "Show to players" : "Hide from players"}
              onClick={() => ctx.execute(hideCombatant, { id: c.id, hidden: !c.hidden })}
            >
              {c.hidden ? <IconSecret /> : <IconReveal />}
            </Button>
            <Button
              variant="icon"
              label="Remove from combat"
              onClick={() => ctx.execute(removeFromCombat, { id: c.id })}
            >
              <IconClose />
            </Button>
          </>
        )}
      </div>
      {ch && (ch.conditions.length > 0 || concentration) && (
        <div className="combat-conditions">
          {ch.conditions.map((id) => {
            const def = system.conditions.find((k) => k.id === id);
            const d = ch.durations[id];
            return (
              <span
                key={id}
                className="list-tag combat-condition"
                title={def?.text}
                style={{ "--condition-colour": conditionColour(system, id) }}
              >
                {def?.name ?? id}
                {d && ` ${d.rounds}`}
              </span>
            );
          })}
          {concentration && (
            <span
              className="list-tag combat-condition"
              style={{ "--condition-colour": CONCENTRATION_COLOUR }}
            >
              {concentration}
              {mine && (
                <button
                  type="button"
                  className="combat-chip-x"
                  aria-label="End concentration"
                  onClick={() => ctx.execute(stopConcentrating, { characterId: ch.id })}
                >
                  ×
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {open && ch && mine && (
        <ConditionForm campaign={campaign} characterId={ch.id} turn={turn} everyone={everyone} />
      )}
    </li>
  );
}

/** Give a condition for so many rounds, counted down at the end of a combatant's turn (by default whoever's turn it is). */
function ConditionForm({
  campaign,
  characterId,
  turn,
  everyone,
}: {
  campaign: Campaign;
  characterId: string;
  turn: string | null;
  everyone: CombatantView[];
}) {
  const ctx = useCampaign();
  const system = systemOf(campaign);
  const [condition, setCondition] = useState(system.conditions[0]?.id ?? "");
  const [rounds, setRounds] = useState(1);
  const [of, setOf] = useState(turn ?? everyone[0]?.id ?? "");
  const [tick, setTick] = useState<"start" | "end">("end");
  const ch = getCharacter(campaign, characterId)!;
  const has = ch.conditions.includes(condition);
  const add = () => {
    if (!condition) return;
    ctx.execute(timeCondition, {
      characterId,
      condition,
      duration: rounds > 0 && of ? { rounds, tick, of } : undefined,
    });
  };
  return (
    <form
      className="combat-form"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <select
        aria-label="Condition"
        value={condition}
        onChange={(e) => setCondition(e.currentTarget.value)}
      >
        {system.conditions.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>
      <label className="combat-form-rounds">
        <input
          type="number"
          min={0}
          max={100}
          value={rounds}
          onInput={(e) => setRounds(Number(e.currentTarget.value) || 0)}
        />
        rounds, to the
      </label>
      <select
        aria-label="Counted at"
        value={tick}
        onChange={(e) => setTick(e.currentTarget.value as "start" | "end")}
      >
        <option value="end">end</option>
        <option value="start">start</option>
      </select>
      <select aria-label="Of whose turn" value={of} onChange={(e) => setOf(e.currentTarget.value)}>
        {everyone.map((x) => (
          <option key={x.id} value={x.id}>
            of {x.name}’s turn
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary">
        {has ? "Set Duration" : "Add"}
      </Button>
      {has && (
        <Button
          variant="ghost"
          onClick={() => ctx.execute(removeTimedCondition, { characterId, condition })}
        >
          Remove
        </Button>
      )}
    </form>
  );
}
