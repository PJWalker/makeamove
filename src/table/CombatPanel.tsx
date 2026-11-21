import { useCallback, useState } from "react";
import { getCharacter, systemOf } from "../features/characters/api";
import { derive } from "../features/characters/store";
import { roundOf, turnOf, turnOrder, type CombatantView } from "../features/combat/combat";
import { combatMaps } from "../features/combat/api";
import type { Campaign } from "../campaign/campaign";
import type { GameSystem } from "../systems/types";
import type { CharacterView } from "../features/characters/types";
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
  const context = useCampaign();
  // Running the fight is the GM's: what the controls show follows who may run them.
  const gm = useQuery(campaign.members, () => can(context, startCombat));
  const state = useQuery(
    campaign.combat,
    () => `${roundOf(combatMaps(campaign))}|${turnOf(combatMaps(campaign)) ?? ""}`,
  );
  const [roundText, turn] = state.split("|");
  const round = Number(roundText);
  const readTurnOrder = useCallback(() => turnOrder(campaign.combatants), [campaign.combatants]);
  const all = useQuery(campaign.combatants, readTurnOrder);
  const shown = gm ? all : all.filter((c) => !c.hidden);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="combat-panel">
      <CombatControls gm={gm} round={round} combatants={all} />
      {shown.length > 0 ? (
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

function CombatControls({
  gm,
  round,
  combatants,
}: {
  gm: boolean;
  round: number;
  combatants: CombatantView[];
}) {
  const context = useCampaign();
  return (
    <PanelActions>
      <span className="combat-round">{round ? `Round ${round}` : "Not started"}</span>
      {gm && (
        <span className="combat-controls">
          {round > 0 ? (
            <>
              <Button
                variant="ghost"
                icon={IconPreviousTurn}
                onClick={() => context.execute(previousCombatTurn)}
              >
                Back
              </Button>
              <Button
                variant="primary"
                icon={IconNextTurn}
                disabled={combatants.length === 0}
                onClick={() => context.execute(nextTurn)}
              >
                Next Turn
              </Button>
              <Button
                variant="ghost"
                icon={IconEndCombat}
                onClick={() => context.execute(endCombat)}
              >
                End
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                icon={IconDice}
                disabled={!combatants.some((combatant) => combatant.init === null)}
                onClick={() => void context.execute(rollForNpcs)}
              >
                Roll for NPCs
              </Button>
              <Button
                variant="primary"
                icon={IconStartCombat}
                disabled={combatants.length === 0}
                onClick={() => context.execute(startCombat)}
              >
                Start
              </Button>
            </>
          )}
        </span>
      )}
    </PanelActions>
  );
}

/** The conditions on a combatant, and the spell they're concentrating on. */
function CombatantConditions({
  system,
  character: ch,
  concentration,
  mine,
}: {
  system: GameSystem;
  character: CharacterView;
  concentration: string | undefined;
  mine: boolean;
}) {
  const context = useCampaign();
  if (ch.conditions.length === 0 && !concentration) return null;
  return (
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
              onClick={() => context.execute(stopConcentrating, { characterId: ch.id })}
            >
              ×
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/** A combatant's initiative: editable by whoever may change it. */
function Initiative({ c, mine }: { c: CombatantView; mine: boolean }) {
  const context = useCampaign();
  if (!mine) return <span className="combat-init">{c.init ?? "–"}</span>;
  return (
    <input
      className="combat-init"
      type="number"
      aria-label={`${c.name} initiative`}
      value={c.init ?? ""}
      onChange={(e) =>
        context.execute(setInitiative, {
          id: c.id,
          init: e.currentTarget.value === "" ? null : Number(e.currentTarget.value),
        })
      }
    />
  );
}

/** Roll initiative, or (for the GM) hide or remove a combatant. */
function CombatantActions({ c, gm, mine }: { c: CombatantView; gm: boolean; mine: boolean }) {
  const context = useCampaign();
  return (
    <>
      {c.init === null && mine && (
        <Button
          variant="icon"
          label="Roll Initiative"
          onClick={() => context.execute(rollCombatantInitiative, { id: c.id })}
        >
          <IconDice />
        </Button>
      )}
      {gm && (
        <>
          <Button
            variant="icon"
            label={c.hidden ? "Show to Players" : "Hide from Players"}
            onClick={() => context.execute(hideCombatant, { id: c.id, hidden: !c.hidden })}
          >
            {c.hidden ? <IconSecret /> : <IconReveal />}
          </Button>
          <Button
            variant="icon"
            label="Remove from Combat"
            onClick={() => context.execute(removeFromCombat, { id: c.id })}
          >
            <IconClose />
          </Button>
        </>
      )}
    </>
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
  const context = useCampaign();
  const system = systemOf(campaign);
  // Re-render when the character changes (HP, conditions).
  const readCharacter = useCallback(
    () => getCharacter(campaign, c.characterId) ?? null,
    [campaign, c.characterId],
  );
  const ch = useQuery(campaign.characters, readCharacter);
  // Their player or the GM: whoever may change their initiative.
  const mine = can(context, setInitiative, { id: c.id, init: null });
  const hp = ch ? (ch.resources["hp"] ?? 0) : null;
  const maxHp = ch ? derive(ch, system).values["maxHp"] : null;
  const concentration = ch?.concentration
    ? system.actions.find((a) => a.id === ch.concentration)?.name
    : undefined;

  return (
    <li
      className="combat-row"
      data-current={current || undefined}
      data-hidden={c.hidden || undefined}
    >
      <div className="combat-main">
        <Initiative c={c} mine={mine} />
        <button type="button" className="combat-name" onClick={onToggle} aria-expanded={open}>
          {c.name}
          {hp !== null && gm && (
            <span className="muted">
              {" "}
              {hp}/{maxHp}
            </span>
          )}
        </button>
        <CombatantActions c={c} gm={gm} mine={mine} />
      </div>
      {ch && (
        <CombatantConditions
          system={system}
          character={ch}
          concentration={concentration}
          mine={mine}
        />
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
  const {
    system,
    condition,
    setCondition,
    rounds,
    setRounds,
    of,
    setOf,
    tick,
    setTick,
    has,
    add,
    remove,
  } = useConditionForm(campaign, characterId, turn, everyone);
  return (
    <form
      className="combat-form"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <select
        name="condition"
        aria-label="Condition"
        value={condition}
        onChange={(event) => setCondition(event.currentTarget.value)}
      >
        {system.conditions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <label className="combat-form-rounds">
        <input
          name="rounds"
          type="number"
          min={0}
          max={100}
          value={rounds}
          onInput={(event) => setRounds(Number(event.currentTarget.value) || 0)}
        />
        rounds, to the
      </label>
      <select
        name="tick"
        aria-label="Counted at"
        value={tick}
        onChange={(event) => setTick(event.currentTarget.value as "start" | "end")}
      >
        <option value="end">end</option>
        <option value="start">start</option>
      </select>
      <select
        name="of"
        aria-label="Of whose turn"
        value={of}
        onChange={(event) => setOf(event.currentTarget.value)}
      >
        {everyone.map((combatant) => (
          <option key={combatant.id} value={combatant.id}>
            of {combatant.name}’s turn
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary">
        {has ? "Set Duration" : "Add"}
      </Button>
      {has && (
        <Button variant="ghost" onClick={remove}>
          Remove
        </Button>
      )}
    </form>
  );
}

function useConditionForm(
  campaign: Campaign,
  characterId: string,
  turn: string | null,
  everyone: CombatantView[],
) {
  const context = useCampaign();
  const system = systemOf(campaign);
  const [condition, setCondition] = useState(system.conditions[0]?.id ?? "");
  const [rounds, setRounds] = useState(1);
  const [of, setOf] = useState(turn ?? everyone[0]?.id ?? "");
  const [tick, setTick] = useState<"start" | "end">("end");
  const ch = getCharacter(campaign, characterId)!;
  const has = ch.conditions.includes(condition);
  const add = () => {
    if (!condition) return;
    context.execute(timeCondition, {
      characterId,
      condition,
      duration: rounds > 0 && of ? { rounds, tick, of } : undefined,
    });
  };
  const remove = () => context.execute(removeTimedCondition, { characterId, condition });
  return {
    system,
    condition,
    setCondition,
    rounds,
    setRounds,
    of,
    setOf,
    tick,
    setTick,
    has,
    add,
    remove,
  };
}
