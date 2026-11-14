import { asRichText, sameRichText } from "../data/richText";
import { RichTextView } from "../workspace/RichTextView";
import { type Ref } from "react";
import { useConstant } from "../ui/useConstant";
import type { MoveMessage, RollMessage, RollVisibility } from "../features/chat/types";
import { type Roll } from "../features/dice/notation";
import { getCharacter, systemOf } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { DamageTargets, SaveRequests, TargetRolls } from "./CardParts";
import { poolFormula, type TrayPick } from "../features/dice/pool";
import { PendingDie, RollChip, RollDie } from "./RollDie";
import { rollCarriedDice } from "./rollDieHelpers";
import { colourOf } from "../scene/presence";
import { canWork } from "../features/chat/types";
import { readRollState } from "../features/chat/rollState";
import { useThrow } from "../ui/useThrow";
import { readRollResult } from "../features/characters/moves";
import { derive } from "../features/characters/store";
import { applySuggestion } from "../workspace/commands/characters";
import { useCampaign } from "../workspace/campaignContext";
import { reroll, toggleDie } from "../workspace/commands/chat";
import { can } from "../workspace/commands/views";

/* Rolls and moves in the chat: their dice, which anyone allowed can reroll or throw, and their outcome. */

const VISIBILITY_LABEL: Record<RollVisibility, string> = {
  public: "",
  private: "Secret: you and the GM",
};

type Thrown = { arriving: boolean; mine: boolean };

/** The dice of a roll take the colour of the player who rolled them. */
const rollerDiceColour = (m: RollMessage | MoveMessage) =>
  colourOf({ id: m.author, ...(m.colour ? { colour: m.colour } : {}) });

export function PendingRollCard({
  picks,
  visibility,
  cardRef,
  releasedRoll,
  onDieLanded,
  onDieEntered,
}: {
  picks: TrayPick[];
  visibility: RollVisibility;
  cardRef: Ref<HTMLOutputElement>;
  releasedRoll: { roll: Roll; seed: string; trayVelocity: { x: number; y: number } } | null;
  onDieLanded: (index: number) => void;
  onDieEntered: (key: string) => void;
}) {
  const formula = poolFormula(picks);
  const dice = new Map<number, number>();
  const stats: Extract<TrayPick, { kind: "stat" }>[] = [];
  let modifier = 0;
  for (const pick of picks) {
    if (pick.kind === "die") dice.set(pick.sides, (dice.get(pick.sides) ?? 0) + 1);
    else if (pick.kind === "modifier") modifier += pick.value;
    else stats.push(pick);
  }
  const rolledValues = new Map<number, number[]>();
  if (releasedRoll)
    for (const term of releasedRoll.roll.terms)
      if (term.kind === "dice" && term.dice[0])
        rolledValues.set(
          term.dice[0].sides,
          term.dice.flatMap((die) => (die.exploded ? [] : [die.value])),
        );
  if (!formula) return null;

  let index = 0;
  const diceViews = [...dice].flatMap(([sides, count]) =>
    Array.from({ length: count }, (_, dieIndex) => {
      const current = index++;
      const entryKey = `${sides}:${dieIndex}`;
      return (
        <PendingDie
          key={entryKey}
          sides={sides}
          index={current}
          seed={`pending:${sides}:${dieIndex}`}
          entryKey={entryKey}
          releaseValue={rolledValues.get(sides)?.[dieIndex]}
          releaseSeed={releasedRoll ? `${releasedRoll.seed}:${current}` : undefined}
          trayVelocity={releasedRoll?.trayVelocity}
          onLanded={() => onDieLanded(current)}
          onEntered={onDieEntered}
        />
      );
    }),
  );
  const chipViews = [
    ...(modifier
      ? [
          <RollChip
            key="modifier"
            value={modifier}
            index={index}
            pendingIndex={index++}
            seed="pending:modifier"
            arriving={false}
            mine
          />,
        ]
      : []),
    ...stats.map((pick, statIndex) => {
      const current = index++;
      return (
        <RollChip
          key={`stat:${statIndex}`}
          value={pick.value}
          label={pick.stat}
          index={current}
          pendingIndex={current}
          seed={`pending:stat:${statIndex}`}
          arriving={false}
          mine
        />
      );
    }),
  ];

  return (
    <output ref={cardRef} className="roll-card pending-roll" aria-label={`Queued roll: ${formula}`}>
      <div className="roll-head">
        <span className="roll-formula">{formula}</span>
        {visibility === "private" && (
          <span className="roll-visibility">{VISIBILITY_LABEL.private}</span>
        )}
      </div>
      <div className="roll-body">
        <div className="roll-terms">
          {diceViews}
          {chipViews}
        </div>
        <span className="roll-total pending-roll-total" aria-hidden="true">
          ?
        </span>
      </div>
    </output>
  );
}

function useSharedRoll(campaign: Campaign, message: RollMessage | MoveMessage) {
  const ctx = useCampaign();
  const source = message.roll;
  const snapshot = JSON.parse(
    useQuery(campaign.messageState, () =>
      JSON.stringify(source ? readRollState(campaign.messageState, message.id, source) : null),
    ),
  ) as ReturnType<typeof readRollState> | null;
  const allowed = useQuery(campaign.members, () => can(ctx, reroll, { id: message.id }));
  return {
    snapshot,
    allowed,
    rerollAll: () => ctx.execute(reroll, { id: message.id }),
    reroll: (term: number, die: number) => ctx.execute(reroll, { id: message.id, term, die }),
    toggle: (term: number, die: number) => ctx.execute(toggleDie, { id: message.id, term, die }),
  };
}

type RollInteraction = ReturnType<typeof useSharedRoll>;

export function RollCard({
  campaign,
  m,
  masked,
  arriving,
  mine,
  quickRoll = false,
  quickRollActive = false,
}: {
  campaign: Campaign;
  m: RollMessage;
  masked: boolean;
  quickRoll?: boolean;
  quickRollActive?: boolean;
} & Thrown) {
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
      data-quick-roll={quickRoll || undefined}
      data-quick-roll-active={quickRollActive || undefined}
      data-throwable={interaction.allowed || undefined}
      data-dice-target={interaction.allowed ? m.id : undefined}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the roll can be rerolled by keyboard
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
          arriving={arriving && !quickRoll}
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
}: {
  roll: Roll;
  colour: string;
  interaction: RollInteraction;
} & Thrown) {
  const seeds = interaction.snapshot!.seeds;
  const initial = useConstant(
    () => new Set(seeds.flatMap((row, i) => (row.length ? row : [`flat:${i}`]))),
  );
  return (
    <div className="roll-terms">
      {roll.terms.map((t, i) => {
        const key =
          t.kind === "flat"
            ? (seeds[i]?.[0] ?? `${t.sign}:${t.value}:${t.label ?? ""}`)
            : (seeds[i]?.join(":") ?? `${t.sign}:${t.label ?? ""}:${t.dice.length}`);
        return (
          <span key={key} className="roll-term">
            {/* A chip shows its own sign. */}
            {t.kind === "dice" && (i > 0 || t.sign < 0) && (
              <span className="roll-op">{t.sign < 0 ? "−" : "+"}</span>
            )}
            {t.kind === "flat" ? (
              <RollChip
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
        );
      })}
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
  const ctx = useCampaign();
  const interaction = useSharedRoll(campaign, original);
  const messages = useQuery(campaign.chat.messages);
  const gm = useQuery(campaign.members, () => campaign.isGm());
  const me = useQuery(device).id;
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
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the roll can be rerolled by keyboard
      tabIndex={interaction.allowed && m.roll ? 0 : undefined}
      {...gesture}
    >
      <div className="roll-head">
        <span className="roll-formula">{m.moveName}</span>
        <span className="roll-comment">{m.characterName}</span>
      </div>
      {m.text && !sameRichText(asRichText(m.text), asRichText(m.outcome)) && (
        <RichTextView
          campaign={campaign}
          text={asRichText(m.text)}
          characterId={m.characterId ?? null}
        />
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
      <RichTextView
        campaign={campaign}
        text={asRichText(m.outcome)}
        characterId={m.characterId ?? null}
        className="move-outcome"
      />
      {m.save && <SaveRequests campaign={campaign} m={m} />}
      {canAct && m.suggestions.length > 0 && (
        <div className="move-suggest">
          {m.suggestions.map((s) => {
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
                key={s.label}
                variant="ghost"
                disabled={!canAdvance}
                onClick={() =>
                  ctx.execute(applySuggestion, { characterId: m.characterId, suggestion: s })
                }
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
