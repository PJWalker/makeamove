import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { newId } from "../lib/ids";
import { useCampaign } from "../workspace/campaignContext";
import { addToChatRoll, roll } from "../workspace/commands/chat";
import type { RollVisibility } from "../features/chat/types";
import { NotationError, roll as rollDice, seededDie, type Roll } from "../features/dice/notation";
import { poolFormula, samePick, type TrayPick } from "../features/dice/pool";
import { trackPointer } from "../ui/pointer";
import { holdNewPick } from "./rollDieHelpers";
import { markTrayRolled, unmarkTrayRolled } from "./quickRolls";

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
export const POOL_MS = 1000;
/** How far (CSS px) the pointer moves from a die button before it carries a die off. */
const DRAG_START = 6;

/** The roll a die let go of at this point joins, if any. */
const rollAt = (x: number, y: number) =>
  document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dice-target]") ?? null;

/**
 * Quick dice gather into a pool, rolled together once the clicks stop: clicking the d20 twice rolls
 * 2d20 as one entry. It also carries a die dragged out of the tray onto a roll, and flies the pending
 * card into the chat when the roll is posted.
 */
export function useDicePool({
  visibility,
  onQuickRollMessage,
  onError,
}: {
  visibility: RollVisibility;
  onQuickRollMessage: (id: string | null) => void;
  onError: (message: string) => void;
}) {
  const context = useCampaign();
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
  const rollPoolReference = useRef<(transition?: boolean) => Promise<void>>(async () => {});

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
    if (pool.length === 0 || releasedRoll) return;
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
        await context.execute(roll, { formula, visibility, seed });
        setPool([]);
        return;
      }
      markTrayRolled(messageId);
      onQuickRollMessage(messageId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const message = await context.execute(roll, { formula, visibility, seed, messageId });
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
      card.dataset["inFeed"] = "true";
      await landed;
      setPool([]);
    } catch (error) {
      if (error instanceof NotationError) onError(error.message);
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
    rollPoolReference.current = rollPool;
  });

  function setPoolAndTimer(next: TrayPick[]) {
    entryWait.current?.resolve();
    entryWait.current = null;
    setPool(next);
    const activeKeys = dieEntryKeys(next);
    enteredDice.current = new Set([...enteredDice.current].filter((key) => activeKeys.has(key)));
    clearTimeout(poolTimer.current);
    poolTimer.current = 0;
    if (next.length > 0)
      poolTimer.current = globalThis.setTimeout(() => {
        void rollPoolReference.current();
      }, POOL_MS);
  }

  function addPick(pick: TrayPick) {
    setPoolAndTimer([...pool, pick]);
  }

  /** Right-click while pooling: take one of these picks back out. */
  function removePick(pick: TrayPick) {
    const index = pool.findLastIndex((picked) => samePick(picked, pick));
    if (index === -1) return;
    setPoolAndTimer(pool.filter((_, index_) => index_ !== index));
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
        if (card?.dataset["diceTarget"])
          context.execute(addToChatRoll, { id: card.dataset["diceTarget"], pick });
        else if (
          pick.kind === "die" &&
          !document.elementFromPoint(end.clientX, end.clientY)?.closest(".dice-tray")
        )
          void context.execute(roll, { formula: `d${pick.sides}`, visibility });
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
      void rollPoolReference.current(false);
    },
    [],
  );

  return {
    pool,
    releasedRoll,
    diceTray,
    pendingRollCard,
    dragged,
    addPick,
    removePick,
    dragOut,
    pendingDieLanded,
    pendingDieEntered,
  };
}
