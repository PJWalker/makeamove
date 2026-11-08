import { FormattedText } from "../workspace/FormattedText";
import { useState } from "react";
import type { MoveMessage, RollMessage, RollVisibility } from "../features/chat/types";
import { type Roll } from "../features/dice/notation";
import { applySuggestion, getCharacter, systemOf } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useY } from "../ui/useY";
import { Button } from "../ui/Button";
import { DamageTargets, SaveRequests, TargetRolls } from "./CardParts";
import { dieColour, rollCarriedDice, RollChip, RollDie } from "./RollDie";
import { colourOf } from "../scene/presence";
import { canWork } from "../features/chat/types";
import { readRollState, rerollDie, rerollMessage, toggleRollDie } from "../features/chat/rollState";
import { useThrow } from "../ui/useThrow";
import { readRollResult } from "../features/characters/moves";
import { derive } from "../features/characters/store";
import { useValue } from "../ui/useValue";

/* Rolls and moves in the chat: their dice, which anyone allowed can reroll or throw, and their outcome. */

const VISIBILITY_LABEL: Record<RollVisibility, string> = {
  public: "",
  private: "Secret: you and the GM",
};

type Thrown = { arriving: boolean; mine: boolean };

/** The dice of a roll take the colour of the player who rolled them. */
const rollerDiceColour = (m: RollMessage | MoveMessage) =>
  dieColour(colourOf({ id: m.author, ...(m.colour ? { colour: m.colour } : {}) }));

function useSharedRoll(campaign: Campaign, message: RollMessage | MoveMessage) {
  const source = message.roll;
  const snapshot = JSON.parse(
    useY(campaign.messageState, () =>
      JSON.stringify(source ? readRollState(campaign.messageState, message.id, source) : null),
    ),
  ) as ReturnType<typeof readRollState> | null;
  const me = useValue(device).id;
  const allowed = useY(campaign.members, () => canWork(message, me, campaign.isGm()));
  const canChange = () => canWork(message, me, campaign.isGm());
  return {
    snapshot,
    allowed,
    rerollAll: () => {
      if (source && canChange()) rerollMessage(campaign.messageState, message.id, source);
    },
    reroll: (term: number, die: number) => {
      if (source && canChange()) rerollDie(campaign.messageState, message.id, source, term, die);
    },
    toggle: (term: number, die: number) => {
      if (source && canChange())
        toggleRollDie(campaign.messageState, message.id, source, term, die);
    },
  };
}

type RollInteraction = ReturnType<typeof useSharedRoll>;

export function RollCard({
  campaign,
  m,
  masked,
  arriving,
  mine,
}: { campaign: Campaign; m: RollMessage; masked: boolean } & Thrown) {
  const interaction = useSharedRoll(campaign, m);
  const gesture = useThrow({
    onThrow: interaction.rerollAll,
    onAway: rollCarriedDice,
    enabled: interaction.allowed && !masked,
    ignoreControls: true,
  });
  if (masked) {
    return (
      <div className="roll-card" data-masked="true">
        <span className="roll-secret">{m.name} rolled in secret.</span>
      </div>
    );
  }
  const r = interaction.snapshot!.roll;
  return (
    <div
      className="roll-card"
      aria-label={`${r.formula}${m.comment ? `, ${m.comment}` : ""}: ${r.total}`}
      data-throwable={interaction.allowed || undefined}
      data-dice-target={interaction.allowed ? m.id : undefined}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the roll can be rerolled by keyboard
      tabIndex={interaction.allowed ? 0 : undefined}
      {...gesture}
    >
      <div className="roll-head">
        <span className="roll-formula">{r.formula}</span>
        {m.comment && <span className="roll-comment">{m.comment}</span>}
        {m.visibility !== "public" && (
          <span className="roll-visibility">{VISIBILITY_LABEL[m.visibility]}</span>
        )}
      </div>
      <div className="roll-body">
        <RollTerms
          roll={r}
          colour={rollerDiceColour(m)}
          arriving={arriving}
          mine={mine}
          interaction={interaction}
        />
        <span className="roll-total">{r.total}</span>
      </div>
      {m.damage && <DamageTargets campaign={campaign} m={{ ...m, roll: r }} />}
    </div>
  );
}
function RollTerms({
  roll,
  colour,
  arriving,
  mine,
  interaction,
}: { roll: Roll; colour: string; interaction: RollInteraction } & Thrown) {
  const seeds = interaction.snapshot!.seeds;
  const [initial] = useState(
    () => new Set(seeds.flatMap((row, i) => (row.length ? row : [`flat:${i}`]))),
  );
  return (
    <div className="roll-terms">
      {roll.terms.map((t, i) => (
        <span key={i} className="roll-term">
          {/* A chip shows its own sign. */}
          {t.kind === "dice" && (i > 0 || t.sign < 0) && (
            <span className="roll-op">{t.sign < 0 ? "−" : "+"}</span>
          )}
          {t.kind === "flat" ? (
            <RollChip
              key={seeds[i]?.[0] ?? `flat:${i}`}
              value={t.sign * t.value}
              label={t.label}
              index={i}
              // Rolls edited before chips had seeds have none for them.
              seed={seeds[i]?.[0] ?? `flat:${i}`}
              arriving={arriving || !initial.has(seeds[i]?.[0] ?? `flat:${i}`)}
              mine={mine}
            />
          ) : (
            <>
              {t.dice.map((d, j) => {
                const seed = seeds[i]![j]!;
                return (
                  <RollDie
                    key={seed}
                    die={d}
                    index={j}
                    arriving={arriving || !initial.has(seed)}
                    mine={mine}
                    seed={seed}
                    colour={colour}
                    onReroll={interaction.allowed ? () => interaction.reroll(i, j) : undefined}
                    onToggle={interaction.allowed ? () => interaction.toggle(i, j) : undefined}
                  />
                );
              })}
              {t.label && <span className="roll-label">{t.label}</span>}
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/** A move: its name, the roll behind it, the outcome, and follow-up buttons. */
export function MoveCard({
  campaign,
  m: original,
  canAct,
  arriving,
  mine,
}: { campaign: Campaign; m: MoveMessage; canAct: boolean } & Thrown) {
  const interaction = useSharedRoll(campaign, original);
  const messages = useValue(campaign.chat.messages);
  const gm = useY(campaign.members, () => campaign.isGm());
  const me = useValue(device).id;
  const gesture = useThrow({
    onThrow: interaction.rerollAll,
    onAway: rollCarriedDice,
    enabled: interaction.allowed && !!original.roll,
    ignoreControls: true,
  });
  let m = original;
  if (interaction.snapshot?.edited && original.roll) {
    const system = systemOf(campaign);
    const character = getCharacter(campaign, original.characterId);
    const action = system.actions.find((candidate) => candidate.id === original.moveId);
    if (character && action) {
      const derived = derive(character, system);
      m = {
        ...original,
        roll: interaction.snapshot.roll,
        ...readRollResult(
          system,
          action,
          character,
          { ...derived, values: { ...derived.values, ...original.rollValues } },
          interaction.snapshot.roll,
          original.targets,
          original.difficulty,
          original.counterMessageId,
        ),
      };
    }
  }
  const result = m.result ? systemOf(campaign).results.find((r) => r.id === m.result) : undefined;
  const label = result ? result.label : m.result;
  return (
    <div
      className="roll-card move-card"
      data-band={result?.tone ?? "none"}
      data-rolled={!!m.roll || undefined}
      data-throwable={(interaction.allowed && !!m.roll) || undefined}
      data-dice-target={interaction.allowed && m.roll ? m.id : undefined}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the roll can be rerolled by keyboard
      tabIndex={interaction.allowed && m.roll ? 0 : undefined}
      {...gesture}
    >
      <div className="roll-head">
        <span className="roll-formula">{m.moveName}</span>
        <span className="roll-comment">{m.characterName}</span>
      </div>
      {m.text && m.text !== m.outcome && (
        <FormattedText campaign={campaign} text={m.text} characterId={m.characterId ?? null} />
      )}
      {m.targets?.some((t) => t.roll) ? (
        <TargetRolls campaign={campaign} m={m} />
      ) : (
        m.targets &&
        !m.save && (
          <p className="move-targets">
            <span className="muted">Targeting</span>{" "}
            {m.targets.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ", "}
                {t.name}
                {t.distance && <span className="muted"> ({t.distance})</span>}
              </span>
            ))}
          </p>
        )
      )}
      {m.roll && (
        <div className="roll-body">
          <RollTerms
            roll={interaction.snapshot!.roll}
            colour={rollerDiceColour(original)}
            arriving={arriving}
            mine={mine}
            interaction={interaction}
          />
          <span className="roll-total">{interaction.snapshot!.roll.total}</span>
        </div>
      )}
      {label && <div className="move-band">{label}</div>}
      <FormattedText
        campaign={campaign}
        text={m.outcome}
        characterId={m.characterId ?? null}
        className="move-outcome"
      />
      {m.save && <SaveRequests campaign={campaign} m={m} />}
      {canAct && m.suggestions.length > 0 && (
        <div className="move-suggest">
          {m.suggestions.map((s, i) => {
            const count = s.count?.messageId
              ? messages.find((message) => message.id === s.count!.messageId)
              : undefined;
            const canAdvance =
              !s.count ||
              (s.count.systemCounter
                ? gm
                : !!count && count.kind === "counter" && canWork(count, me, gm));
            return (
              <Button
                key={i}
                variant="ghost"
                disabled={!canAdvance}
                onClick={() => applySuggestion(campaign, m.characterId, s)}
              >
                {s.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
