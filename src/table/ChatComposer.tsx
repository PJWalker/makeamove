import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { commandText, emptyChatContent, type ChatContent } from "../features/chat/content";
import { newId } from "../lib/ids";
import { useCampaign } from "../workspace/campaignContext";
import { addToChatRoll, chatCall, roll, suggestSlash } from "../workspace/commands/chat";
import { invoke } from "../workspace/commands/views";
import type { RollVisibility } from "../features/chat/types";
import { NotationError, roll as rollDice, seededDie, type Roll } from "../features/dice/notation";
import { pickName, poolFormula, samePick, signed, type TrayPick } from "../features/dice/pool";
import { actingCharacterId, actingStatBonuses } from "../features/characters/api";
import type { Campaign } from "../campaign/campaign";
import { useQuery } from "../ui/useQuery";
import { Button } from "../ui/Button";
import { trackPointer } from "../ui/pointer";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { holdNewPick } from "./rollDieHelpers";
import { PendingRollCard } from "./RollCards";
import { markTrayRolled, unmarkTrayRolled } from "./quickRolls";

const VISIBILITIES: { id: RollVisibility; label: string; title: string }[] = [
  { id: "public", label: "Public", title: "Everyone sees the roll" },
  {
    id: "private",
    label: "Secret",
    title: "Only you and the GM see the result",
  },
];
const DICE: TrayPick[] = [4, 6, 8, 10, 12, 20].map((sides) => ({ kind: "die", sides }));
const TOKENS: TrayPick[] = [
  { kind: "modifier", value: 1 },
  { kind: "modifier", value: -1 },
];
const dieEntryKeys = (picks: TrayPick[]) => {
  const counts = new Map<number, number>();
  const keys = new Set<string>();
  for (const pick of picks) {
    if (pick.kind !== "die") continue;
    const index = counts.get(pick.sides) ?? 0;
    counts.set(pick.sides, index + 1);
    keys.add(`${pick.sides}:${index}`);
  }
  return keys;
};
/** How long after the last quick-dice click the pool rolls. */
const POOL_MS = 1000;
/** How far (CSS px) the pointer moves from a die button before it carries a die off. */
const DRAG_START = 6;

/** The roll a die let go of at this point joins, if any. */
const rollAt = (x: number, y: number) =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dice-target]") ?? null;

/** The message box, its command hints, and the quick dice bar above it. */
export function ChatComposer({
  campaign,
  onQuickRollMessage,
  rollOverlay,
}: {
  campaign: Campaign;
  onQuickRollMessage: (id: string | null) => void;
  rollOverlay: HTMLElement | null;
}) {
  const ctx = useCampaign();
  const [content, setContent] = useState<ChatContent>(() => emptyChatContent());
  const typed = commandText(content);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<RollVisibility>("public");
  const last = useRef("");
  const input = useRef<ChatInputHandle | null>(null);
  // Which commands are offered follows the player's role.
  useQuery(campaign.members, () => campaign.isGm());
  // The selected character's stats, as chips; read again as the character or the choice changes.
  useQuery(campaign.members, () => actingCharacterId(campaign));
  const stats = JSON.parse(
    useQuery(campaign.characters, () =>
      JSON.stringify(
        actingStatBonuses(campaign).map(({ stat, value }) => ({ kind: "stat", stat, value })),
      ),
    ),
  ) as TrayPick[];
  const hints = suggestSlash(ctx, typed);

  function send() {
    const message = content;
    const source = commandText(message);
    if (!source.trim()) return;
    // Quick dice and a bare formula use the toggle's visibility; /r and /sr their own.
    const call = chatCall(ctx, message, visibility);
    if ("error" in call) {
      setError(call.error);
      return;
    }
    invoke(ctx, call.command, call.params);
    last.current = source;
    input.current?.set("");
    setError(null);
  }

  // Quick dice gather into a pool, rolled together once the clicks stop:
  // clicking the d20 twice rolls 2d20 as one entry.
  const [pool, setPool] = useState<TrayPick[]>([]);
  const [releasedRoll, setReleasedRoll] = useState<{
    roll: Roll;
    seed: string;
    trayVelocity: { x: number; y: number };
  } | null>(null);
  const diceTray = useRef<HTMLDivElement | null>(null);
  const pendingRollCard = useRef<HTMLOutputElement | null>(null);
  const enteredDice = useRef(new Set<string>());
  const entryWait = useRef<{ keys: Set<string>; resolve: () => void } | null>(null);
  const releaseLanded = useRef<{
    seed: string;
    count: number;
    landed: Set<number>;
    resolve: () => void;
  } | null>(null);
  const poolTimer = useRef(0);
  const rollPoolRef = useRef<(transition?: boolean) => Promise<void>>(async () => {});

  function pendingDieLanded(index: number) {
    const release = releaseLanded.current;
    if (!release || release.landed.has(index)) return;
    release.landed.add(index);
    if (release.landed.size < release.count) return;
    releaseLanded.current = null;
    release.resolve();
  }

  function pendingDieEntered(key: string) {
    enteredDice.current.add(key);
    const wait = entryWait.current;
    if (!wait || ![...wait.keys].every((entryKey) => enteredDice.current.has(entryKey))) return;
    entryWait.current = null;
    wait.resolve();
  }

  function waitForEntry(keys: Set<string>) {
    if ([...keys].every((key) => enteredDice.current.has(key))) return Promise.resolve();
    return new Promise<void>((resolve) => {
      entryWait.current = { keys, resolve };
    });
  }

  useLayoutEffect(() => {
    if (!pool.length || releasedRoll) return;
    const tray = diceTray.current;
    const card = pendingRollCard.current;
    if (!tray || !card) return;
    const trayBounds = tray.getBoundingClientRect();
    const width = Math.max(0, trayBounds.width - 2 * 12);
    card.style.width = `${width}px`;
    const height = card.getBoundingClientRect().height;
    card.style.left = `${trayBounds.left + 12}px`;
    card.style.top = `${trayBounds.top - height + 6}px`;
  }, [pool, releasedRoll]);

  async function rollPool(transition = true) {
    clearTimeout(poolTimer.current);
    const formula = poolFormula(pool);
    if (!formula) {
      setPool([]);
      return;
    }
    const entryKeys = dieEntryKeys(pool);
    if (transition) {
      const timer = poolTimer.current;
      await waitForEntry(entryKeys);
      if (timer !== poolTimer.current) return;
    }
    const seed = crypto.randomUUID();
    const messageId = newId();
    let messagePosted = false;
    try {
      const result = rollDice(formula, seededDie(seed));
      if (!transition) {
        await ctx.execute(roll, { formula, visibility, seed });
        setPool([]);
        return;
      }
      markTrayRolled(messageId);
      onQuickRollMessage(messageId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const message = await ctx.execute(roll, { formula, visibility, seed, messageId });
      if (!message) {
        unmarkTrayRolled(messageId);
        return;
      }
      messagePosted = true;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const card = pendingRollCard.current;
      const destination = document.querySelector<HTMLElement>(
        ".chat-log .roll-card[data-quick-roll-active]",
      );
      if (!card || !destination) return;
      const start = card.getBoundingClientRect();
      const end = destination.getBoundingClientRect();
      const dx = end.left - start.left;
      const dy = end.top - start.top;
      const duration = 360;
      const diceCount = entryKeys.size;
      const landed =
        diceCount > 0
          ? new Promise<void>((resolve) => {
              releaseLanded.current = { seed, count: diceCount, landed: new Set(), resolve };
            })
          : Promise.resolve();
      setReleasedRoll({
        roll: result,
        seed,
        trayVelocity: { x: (dx * 1000) / duration, y: (dy * 1000) / duration },
      });
      const flight = card.animate(
        [{ transform: "translate(0, 0)" }, { transform: `translate(${dx}px, ${dy}px)` }],
        { duration, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
      );
      await flight.finished.catch(() => {});
      const currentDestination = destination.getBoundingClientRect();
      const currentCard = card.getBoundingClientRect();
      card.style.left = `${Number.parseFloat(card.style.left) + currentDestination.left - currentCard.left}px`;
      card.style.top = `${Number.parseFloat(card.style.top) + currentDestination.top - currentCard.top}px`;
      flight.cancel();
      const settledCard = card.getBoundingClientRect();
      const settledDestination = destination.getBoundingClientRect();
      card.style.left = `${Number.parseFloat(card.style.left) + settledDestination.left - settledCard.left}px`;
      card.style.top = `${Number.parseFloat(card.style.top) + settledDestination.top - settledCard.top}px`;
      card.dataset.inFeed = "true";
      await landed;
      setPool([]);
    } catch (e) {
      if (e instanceof NotationError) setError(e.message);
    } finally {
      entryWait.current = null;
      if (!messagePosted) unmarkTrayRolled(messageId);
      releaseLanded.current = null;
      setReleasedRoll(null);
      setPool([]);
      onQuickRollMessage(null);
    }
  }
  // The pool's timer rolls whatever is in it by then.
  useLayoutEffect(() => {
    rollPoolRef.current = rollPool;
  });

  function setPoolAndTimer(next: TrayPick[]) {
    entryWait.current?.resolve();
    entryWait.current = null;
    setPool(next);
    const activeKeys = dieEntryKeys(next);
    enteredDice.current = new Set([...enteredDice.current].filter((key) => activeKeys.has(key)));
    clearTimeout(poolTimer.current);
    poolTimer.current = 0;
    if (next.length)
      poolTimer.current = window.setTimeout(() => {
        void rollPoolRef.current();
      }, POOL_MS);
  }

  function addPick(pick: TrayPick) {
    setPoolAndTimer([...pool, pick]);
  }

  /** Right-click while pooling: take one of these picks back out. */
  function removePick(pick: TrayPick) {
    const i = pool.findLastIndex((picked) => samePick(picked, pick));
    if (i < 0) return;
    setPoolAndTimer(pool.filter((_, j) => j !== i));
  }
  /**
   * Dragging out of a die or token button carries off a new one: let go over
   * a roll this device may change, it joins that roll; a die let go anywhere
   * else but the tray is rolled on its own.
   */
  const dragged = useRef(false);
  function dragOut(event: React.PointerEvent<HTMLButtonElement>, pick: TrayPick) {
    if (event.button !== 0) return;
    dragged.current = false;
    const origin = { x: event.clientX, y: event.clientY };
    let held: ReturnType<typeof holdNewPick> | undefined;
    let target: HTMLElement | null = null;
    const aim = (card: HTMLElement | null) => {
      if (card === target) return;
      target?.removeAttribute("data-drop-target");
      card?.setAttribute("data-drop-target", "");
      target = card;
    };
    trackPointer(
      "grabbing",
      (move) => {
        if (!held) {
          if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < DRAG_START) return;
          held = holdNewPick(pick);
          dragged.current = true;
        }
        held.move(move.clientX, move.clientY);
        aim(rollAt(move.clientX, move.clientY));
      },
      (end) => {
        if (!held) return;
        held.remove();
        const card = target;
        aim(null);
        if (!(end instanceof PointerEvent) || end.type !== "pointerup") return;
        if (card?.dataset.diceTarget)
          ctx.execute(addToChatRoll, { id: card.dataset.diceTarget, pick });
        else if (
          pick.kind === "die" &&
          !document.elementFromPoint(end.clientX, end.clientY)?.closest(".dice-tray")
        )
          void ctx.execute(roll, { formula: `d${pick.sides}`, visibility });
      },
    );
  }

  // Dice picked just before the panel closes still get rolled.
  useEffect(
    () => () => {
      clearTimeout(poolTimer.current);
      poolTimer.current = 0;
      entryWait.current?.resolve();
      entryWait.current = null;
      void rollPoolRef.current(false);
    },
    [],
  );

  const nextVisibility = () => {
    const options = VISIBILITIES.map((v) => v.id);
    setVisibility(options[(options.indexOf(visibility) + 1) % options.length]!);
  };
  const vis = VISIBILITIES.find((v) => v.id === visibility) ?? VISIBILITIES[0]!;

  function pickButton(pick: TrayPick) {
    const name = pickName(pick);
    const n = pool.filter((picked) => samePick(picked, pick)).length;
    return (
      <Button
        key={name}
        variant="secondary"
        className="dice-pick"
        data-count={n || undefined}
        label={
          n
            ? `Add another ${name} (${n} so far; right-click to remove one)`
            : `${pick.kind === "die" ? "Roll a" : "Add"} ${pick.kind === "stat" ? `${name} (${signed(pick.value)})` : name} (click again for more, or drag onto a roll to add it)`
        }
        onPointerDown={(event) => dragOut(event, pick)}
        onClick={() => {
          // The click that ends a drag out of the button isn't a pick.
          if (dragged.current) dragged.current = false;
          else addPick(pick);
        }}
        onContextMenu={(e) => {
          if (!pool.length) return;
          e.preventDefault();
          removePick(pick);
        }}
      >
        {name}
      </Button>
    );
  }

  return (
    <>
      <div className="dice-tray" ref={diceTray}>
        {pool.length > 0 && (
          <span
            key={`progress:${pool.map((pick, index) => `${index}:${pickName(pick)}`).join("|")}`}
            className="dice-pool-progress"
            style={{ "--pool-ms": `${POOL_MS}ms` }}
            aria-hidden="true"
          />
        )}
        <div className="dice-quick">
          <div className="tray-row">
            {DICE.map(pickButton)}
            <Button
              variant="ghost"
              className="dice-visibility"
              label={vis.title}
              onClick={nextVisibility}
            >
              {vis.label}
            </Button>
          </div>
          <div className="tray-row tray-chips">
            {TOKENS.map(pickButton)}
            {stats.length > 0 && <span className="tray-divider" aria-hidden="true" />}
            {stats.map(pickButton)}
          </div>
        </div>
        <form
          className="dice-entry"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {hints.length > 0 && (
            <ul className="chat-hints" aria-label="Commands">
              {hints.map((h) => (
                <li key={h.names[0]}>
                  <button
                    type="button"
                    className="chat-hint"
                    onClick={() => input.current?.set(`/${h.names[0]} `)}
                  >
                    <code>{h.usage}</code>
                    <span>{h.help}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ChatInput
            campaign={campaign}
            handleRef={input}
            placeholder="Message, @ to link, or roll 2d6+1"
            label="Message"
            invalid={!!error}
            onChange={(next) => {
              setContent(next);
              setError(null);
            }}
            onEnter={send}
            onUp={() => last.current && input.current?.set(last.current)}
            onEscape={() => {
              input.current?.set("");
              setError(null);
            }}
          />
          <Button variant="primary" type="submit" label="Send" disabled={!typed.trim()}>
            Send
          </Button>
        </form>
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {pool.length > 0 && rollOverlay
        ? createPortal(
            <PendingRollCard
              key="pending"
              cardRef={pendingRollCard}
              picks={pool}
              visibility={visibility}
              releasedRoll={releasedRoll}
              onDieLanded={pendingDieLanded}
              onDieEntered={pendingDieEntered}
            />,
            rollOverlay,
          )
        : null}
    </>
  );
}
