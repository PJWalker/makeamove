import { useState } from "react";
import { getCharacter, systemOf, toggleCondition } from "../features/characters/api";
import { derive } from "../features/characters/store";
import {
  roundOf,
  removeCombatant,
  turnOf,
  turnOrder,
  updateCombatant,
  previousTurn,
  type CombatantView,
} from "../features/combat/combat";
import {
  advanceTurn,
  beginCombat,
  combatMaps,
  endConcentration,
  finishCombat,
  rollAllInitiative,
  rollInitiative,
  setDuration,
} from "../features/combat/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
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
import { useValue } from "../ui/useValue";
import { CONCENTRATION_COLOUR, conditionColour } from "../features/combat/pipColours";

/*
 * The turn tracker: who's in the fight, in initiative order, whose turn it
 * is and the round. The GM runs it; players roll their own initiative and
 * see everyone the GM hasn't hidden. Each row shows the combatant's
 * conditions, with rounds left for timed ones, and any concentration.
 */

export function CombatPanel({ campaign }: { campaign: Campaign }) {
  const gm = useY(campaign.members, () => campaign.isGm());
  const state = useY(
    campaign.combat,
    () => `${roundOf(combatMaps(campaign))}|${turnOf(combatMaps(campaign)) ?? ""}`,
  );
  const [roundText, turn] = state.split("|");
  const round = Number(roundText);
  const order = useY(campaign.combatants, () => JSON.stringify(turnOrder(campaign.combatants)));
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
                  onClick={() => previousTurn(combatMaps(campaign))}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  icon={IconNextTurn}
                  disabled={!all.length}
                  onClick={() => advanceTurn(campaign)}
                >
                  Next Turn
                </Button>
                <Button variant="ghost" icon={IconEndCombat} onClick={() => finishCombat(campaign)}>
                  End
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  icon={IconDice}
                  disabled={!all.some((c) => c.init === null)}
                  onClick={() => void rollAllInitiative(campaign, { npcsOnly: true })}
                >
                  Roll for NPCs
                </Button>
                <Button
                  variant="primary"
                  icon={IconStartCombat}
                  disabled={!all.length}
                  onClick={() => beginCombat(campaign)}
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
  const system = systemOf(campaign);
  // Re-render when the character changes (HP, conditions).
  useY(campaign.characters, () => JSON.stringify(getCharacter(campaign, c.characterId) ?? null));
  const ch = getCharacter(campaign, c.characterId);
  const me = useValue(device).id;
  const mine = !!ch && (gm || ch.owner === me);
  const hp = ch ? (ch.resources.hp ?? 0) : null;
  const maxHp = ch ? derive(ch, system).values.maxHp : null;
  const concentration = ch?.concentration
    ? system.actions.find((a) => a.id === ch.concentration)?.name
    : undefined;
  const setInit = (v: string) =>
    updateCombatant(combatMaps(campaign), c.id, { init: v === "" ? null : Number(v) });

  return (
    <li
      className="combat-row"
      data-current={current || undefined}
      data-hidden={c.hidden || undefined}
    >
      <div className="combat-main">
        {mine || gm ? (
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
        {c.init === null && (mine || gm) && (
          <Button
            variant="icon"
            label="Roll initiative"
            onClick={() => void rollInitiative(campaign, c.id)}
          >
            <IconDice />
          </Button>
        )}
        {gm && (
          <>
            <Button
              variant="icon"
              label={c.hidden ? "Show to players" : "Hide from players"}
              onClick={() => updateCombatant(combatMaps(campaign), c.id, { hidden: !c.hidden })}
            >
              {c.hidden ? <IconSecret /> : <IconReveal />}
            </Button>
            <Button
              variant="icon"
              label="Remove from combat"
              onClick={() => removeCombatant(combatMaps(campaign), c.id)}
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
                  onClick={() => endConcentration(campaign, ch.id)}
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
  const system = systemOf(campaign);
  const [condition, setCondition] = useState(system.conditions[0]?.id ?? "");
  const [rounds, setRounds] = useState(1);
  const [of, setOf] = useState(turn ?? everyone[0]?.id ?? "");
  const [tick, setTick] = useState<"start" | "end">("end");
  const ch = getCharacter(campaign, characterId)!;
  const has = ch.conditions.includes(condition);
  const add = () => {
    if (!condition) return;
    campaign.doc.transact(() => {
      if (!has) toggleCondition(campaign, characterId, condition);
      setDuration(
        campaign,
        characterId,
        condition,
        rounds > 0 && of ? { rounds: rounds, tick: tick, of: of } : null,
      );
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
          onClick={() =>
            campaign.doc.transact(() => {
              toggleCondition(campaign, characterId, condition);
              setDuration(campaign, characterId, condition, null);
            })
          }
        >
          Remove
        </Button>
      )}
    </form>
  );
}
