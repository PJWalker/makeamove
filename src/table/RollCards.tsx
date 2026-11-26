import type { Ref } from "react";
import { RichTextView } from "../workspace/RichTextView";
import { asRichText, sameRichText } from "../data/richText";
import useConstant from "../ui/useConstant";
import type { MoveMessage, RollMessage, RollVisibility } from "../features/chat/types";
import type { Roll } from "../features/dice/notation";
import { getCharacter, systemOf } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { device } from "../platform/device";
import { useQuery } from "../ui/useQuery";
import Button from "../ui/Button";
import { poolFormula  } from "../features/dice/pool";
import type {TrayPick} from "../features/dice/pool";
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
import { carryDice, rollCarriedDice } from "./rollDieHelpers";
import { PendingDie, RollChip, RollDie } from "./RollDie";
import { DamageTargets, SaveRequests, TargetRolls } from "./CardParts";

/* Rolls and moves in the chat: their dice, which anyone allowed can reroll or throw, and their outcome. */

const VISIBILITY_LABEL: Record<RollVisibility, string> = {
  public: "",
  private: "Secret: you and the GM",
};

interface Thrown { arriving: boolean; mine: boolean }

/** The dice of a roll take the colour of the player who rolled them. */
const rollerDiceColour = (m: MoveMessage | RollMessage) =>
  colourOf({ id: m.author, ...(m.colour ? { colour: m.colour } : {}) });

/** What a queued roll shows, in order: its dice by size, then its modifier, then its stats. */
type PendingEntry =
  | { kind: "die"; sides: number; dieIndex: number }
  | { kind: "modifier"; value: number }
  | { kind: "stat"; value: number; stat: string; statIndex: number };

function pendingEntries(picks: TrayPick[]): PendingEntry[] {
  const counts = new Map<number, number>();
  let modifier = 0;
  const stats: PendingEntry[] = [];
  for (const pick of picks) {
    if (pick.kind === "die") counts.set(pick.sides, (counts.get(pick.sides) ?? 0) + 1);
    else if (pick.kind === "modifier") modifier += pick.value;
    else stats.push({ kind: "stat", value: pick.value, stat: pick.stat, statIndex: stats.length });
  }
  return [
    ...[...counts].flatMap(([sides, count]) =>
      Array.from({ length: count }, (_, dieIndex): PendingEntry => ({
        kind: "die",
        sides,
        dieIndex,
      })),
    ),
    ...(modifier ? [{ kind: "modifier", value: modifier } satisfies PendingEntry] : []),
    ...stats,
  ];
}

/** The values each size of die landed on in a released roll, exploded dice left out. */
function landedValues(roll: Roll | undefined) {
  const values = new Map<number, number[]>();
  for (const term of roll?.terms ?? [])
    if (term.kind === "dice" && term.dice[0])
      values.set(
        term.dice[0].sides,
        term.dice.flatMap((die) => (die.exploded ? [] : [die.value])),
      );
  return values;
}

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
  if (!formula) return null;
  const landed = landedValues(releasedRoll?.roll);
  /** What a queued die rolls when the roll is released. */
  const releaseOf = ({ sides, dieIndex }: { sides: number; dieIndex: number }, index: number) => {
    const value = landed.get(sides)?.[dieIndex];
    return releasedRoll && value !== undefined
      ? { value, seed: `${releasedRoll.seed}:${index}`, trayVelocity: releasedRoll.trayVelocity }
      : undefined;
  };
  const views = pendingEntries(picks).map((entry, index) => {
    if (entry.kind === "die") {
      const entryKey = `${entry.sides}:${entry.dieIndex}`;
      return (
        <PendingDie
          key={entryKey}
          sides={entry.sides}
          index={index}
          release={releaseOf(entry, index)}
          onLanded={() => { onDieLanded(index); }}
          onEntered={() => { onDieEntered(entryKey); }}
        />
      );
    }
    const stat = entry.kind === "stat";
    return (
      <RollChip
        key={stat ? `stat:${entry.statIndex}` : "modifier"}
        value={entry.value}
        {...(stat ? { label: entry.stat } : {})}
        index={index}
        pendingIndex={index}
        seed={stat ? `pending:stat:${entry.statIndex}` : "pending:modifier"}
        arriving={false}
        mine
      />
    );
  });

  return (
    <output ref={cardRef} className="roll-card pending-roll" aria-label={`Queued roll: ${formula}`}>
      <div className="roll-head">
        <span className="roll-formula">{formula}</span>
        {visibility === "private" && (
          <span className="roll-visibility">{VISIBILITY_LABEL.private}</span>
        )}
      </div>
      <div className="roll-body">
        <div className="roll-terms">{views}</div>
        <span className="roll-total pending-roll-total" aria-hidden="true">
          ?
        </span>
      </div>
    </output>
  );
}

function useSharedRoll(campaign: Campaign, message: MoveMessage | RollMessage) {
  const context = useCampaign();
  const source = message.roll;
  const snapshot = JSON.parse(
    useQuery(campaign.messageState, () =>
      JSON.stringify(source ? readRollState(campaign.messageState, message.id, source) : null),
    ),
  ) as ReturnType<typeof readRollState> | null;
  const allowed = useQuery(campaign.members, () => can(context, reroll, { id: message.id }));
  return {
    snapshot,
    allowed,
    rerollAll: () => context.execute(reroll, { id: message.id }),
    reroll: (term: number, die: number) => context.execute(reroll, { id: message.id, term, die }),
    toggle: (term: number, die: number) => context.execute(toggleDie, { id: message.id, term, die }),
  };
}

type RollInteraction = ReturnType<typeof useSharedRoll>;

/** A shared roll that, when `throwable` and this player may reroll it, is thrown again by flicking its card. */
function useThrowableRoll(
  campaign: Campaign,
  message: MoveMessage | RollMessage,
  throwable: boolean,
) {
  const interaction = useSharedRoll(campaign, message);
  const canThrow = interaction.allowed && throwable;
  const gesture = useThrow({
    onThrow: interaction.rerollAll,
    onAway: rollCarriedDice,
    onLift: carryDice,
    enabled: canThrow,
    ignoreControls: true,
  });
  return { interaction, canThrow, gesture };
}

export function RollCard({
  campaign,
  m,
  masked,
  arriving,
  mine,
  quickRoll = false,
  quickRollActive = false,
}: Thrown & {
  campaign: Campaign;
  m: RollMessage;
  masked: boolean;
  quickRoll?: boolean;
  quickRollActive?: boolean;
}) {
  const { interaction, canThrow, gesture } = useThrowableRoll(campaign, m, !masked);
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
      data-throwable={canThrow || undefined}
      data-dice-target={canThrow ? m.id : undefined}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the roll can be rerolled by keyboard
      tabIndex={canThrow ? 0 : undefined}
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
}: Thrown & {
  roll: Roll;
  colour: string;
  interaction: RollInteraction;
}) {
  const {seeds} = (interaction.snapshot!);
  const initial = useConstant(() => new Set(seeds.flat()));
  // Each die and chip is keyed by its own seed, so it keeps its place as others are rerolled, added or taken away.
  return (
    <div className="roll-terms">
      {roll.terms.flatMap((t, index) => {
        const termSeeds = seeds[index]!;
        if (t.kind === "flat") {
          const seed = termSeeds[0]!;
          return (
            // A chip shows its own sign.
            <RollChip
              key={seed}
              value={t.sign * t.value}
              label={t.label}
              index={index}
              seed={seed}
              arriving={arriving || !initial.has(seed)}
              mine={mine}
            />
          );
        }
        return [
          (index > 0 || t.sign < 0) && (
            <span key={`op:${termSeeds[0]}`} className="roll-op">
              {t.sign < 0 ? "−" : "+"}
            </span>
          ),
          ...t.dice.map((d, dieIndex) => {
            const seed = termSeeds[dieIndex]!;
            return (
              <RollDie
                key={seed}
                die={d}
                index={dieIndex}
                arriving={arriving || !initial.has(seed)}
                mine={mine}
                seed={seed}
                colour={colour}
                onReroll={
                  interaction.allowed ? () => interaction.reroll(index, dieIndex) : undefined
                }
                onToggle={
                  interaction.allowed ? () => interaction.toggle(index, dieIndex) : undefined
                }
              />
            );
          }),
          t.label && (
            <span key={`label:${termSeeds[0]}`} className="roll-label">
              {t.label}
            </span>
          ),
        ];
      })}
    </div>
  );
}

/** A move as it reads now: after a roll is edited, its result is worked out again from the new dice. */
function displayedMove(
  campaign: Campaign,
  original: MoveMessage,
  edited: Roll | undefined,
): MoveMessage {
  if (!edited || !original.roll) return original;
  const system = systemOf(campaign);
  const character = getCharacter(campaign, original.characterId);
  const action = system.actions.find((candidate) => candidate.id === original.moveId);
  if (!character || !action) return original;
  const derived = derive(character, system);
  return {
    ...original,
    roll: edited,
    ...readRollResult(
      system,
      action,
      character,
      { ...derived, values: { ...derived.values, ...original.rollValues } },
      edited,
      original.targets,
      original.difficulty,
      original.counterMessageId,
    ),
  };
}

/** What happened to a move's targets: their rolls, or who it was aimed at. */
function MoveTargets({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  if (m.targets?.some((t) => t.roll)) return <TargetRolls campaign={campaign} m={m} />;
  if (!m.targets || m.save) return null;
  return (
    <p className="move-targets">
      <span className="muted">Targeting</span>{" "}
      {m.targets.map((t, index) => (
        <span key={t.id}>
          {index > 0 && ", "}
          {t.name}
          {t.distance && <span className="muted"> ({t.distance})</span>}
        </span>
      ))}
    </p>
  );
}

/** The result a move got, if the system names it. */
const resultOf = (campaign: Campaign, m: MoveMessage) =>
  m.result ? systemOf(campaign).results.find((r) => r.id === m.result) : undefined;

/** How the move turned out: its band, what happened, and any saves it asks of targets. */
function MoveOutcome({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  const label = resultOf(campaign, m)?.label ?? m.result;
  return (
    <>
      {label && <div className="move-band">{label}</div>}
      <RichTextView
        campaign={campaign}
        text={asRichText(m.outcome)}
        characterId={m.characterId ?? null}
        className="move-outcome"
      />
      {m.save && <SaveRequests campaign={campaign} m={m} />}
    </>
  );
}

/** The move's own text, unless the outcome says the same. */
function MoveText({ campaign, m }: { campaign: Campaign; m: MoveMessage }) {
  if (!m.text || sameRichText(asRichText(m.text), asRichText(m.outcome))) return null;
  return (
    <RichTextView
      campaign={campaign}
      text={asRichText(m.text)}
      characterId={m.characterId ?? null}
    />
  );
}

/** The follow-ups a move suggests, each a button unless a counter it moves can't be worked by this player. */
function MoveSuggestions({ m }: { m: MoveMessage }) {
  const context = useCampaign();
  const messages = useQuery(context.campaign.chat.messages);
  const gm = useQuery(context.campaign.members, () => context.campaign.isGm());
  const me = useQuery(device).id;
  if (m.suggestions.length === 0) return null;
  const canAdvance = (s: MoveMessage["suggestions"][number]) => {
    if (!s.count) return true;
    if (s.count.systemCounter) return gm;
    const count = messages.find((message) => message.id === s.count!.messageId);
    return !!count && count.kind === "counter" && canWork(count, me, gm);
  };
  return (
    <div className="move-suggest">
      {m.suggestions.map((s) => (
        <Button
          key={s.label}
          variant="ghost"
          disabled={!canAdvance(s)}
          onClick={() =>
            context.execute(applySuggestion, { characterId: m.characterId, suggestion: s })
          }
        >
          {s.label}
        </Button>
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
}: Thrown & { campaign: Campaign; m: MoveMessage; canAct: boolean }) {
  const {
    interaction,
    canThrow: throwable,
    gesture,
  } = useThrowableRoll(campaign, original, !!original.roll);
  const m = displayedMove(
    campaign,
    original,
    interaction.snapshot?.edited ? interaction.snapshot.roll : undefined,
  );
  const result = resultOf(campaign, m);
  return (
    <div
      className="roll-card move-card"
      data-band={result?.tone ?? "none"}
      data-rolled={!!m.roll || undefined}
      data-throwable={throwable || undefined}
      data-dice-target={throwable ? m.id : undefined}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable so the roll can be rerolled by keyboard
      tabIndex={throwable ? 0 : undefined}
      {...gesture}
    >
      <div className="roll-head">
        <span className="roll-formula">{m.moveName}</span>
        <span className="roll-comment">{m.characterName}</span>
      </div>
      <MoveText campaign={campaign} m={m} />
      <MoveTargets campaign={campaign} m={m} />
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
      <MoveOutcome campaign={campaign} m={m} />
      {canAct && <MoveSuggestions m={m} />}
    </div>
  );
}
