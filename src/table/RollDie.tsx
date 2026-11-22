
import { useEffect, useEffectEvent, useRef } from "react";
import { useMachine } from "@xstate/react";
import type { ReactNode, RefObject } from "react";
import { whenNear } from "../ui/whenNear";
import { useThrow } from "../ui/useThrow";
import { lastPointer } from "../ui/pointer";
import type { Die as RolledDie } from "../features/dice/notation";
import { colourOf } from "../scene/presence";
import { device } from "../platform/device";
import { chipText, signed } from "../features/dice/pool";
import { useQuery } from "../ui/useQuery";
import { threeDimensionalDice } from "../workspace/diceRendering";
import { reducedMotion } from "../ui/transition";
import type {PhysicalDie as Die} from "./rollDieHelpers";
import {
  chipSign,
  dieColours,
  dieShape,
  dieTitle,
  CHIP_COLOUR,
  loadDice,
  rollCarriedDice
  
} from "./rollDieHelpers";
import type { DieLook, Point } from "./dice/types";
import { pieceMachine } from "./pieceMachine";

/** Waiting for the 3D dice, moving, at rest, or drawn flat. */
type Phase = "flat" | "landed" | "moving" | "pending";

/** Where a die thrown into this slot starts: the roller's pointer, or else above the log. */
function throwFrom(slot: HTMLElement, mine: boolean): Point {
  const pointer = mine ? lastPointer() : null;
  if (pointer) return pointer;
  const box = slot.getBoundingClientRect();
  const log = (slot.closest(".chat-log, .chat-popup") ?? slot).getBoundingClientRect();
  return {
    x: box.left + box.width / 2 + (Math.random() - 0.5) * 160,
    y: log.top - 40,
  };
}

/** How a piece comes to be in its slot: thrown or carried in as it arrives, else there already. */
type Entrance = "glide" | "rest" | "throw";

/** A roll of a piece already in its slot, rolled where it lies to show `value`. */
interface Release {
  value: number;
  seed: string;
  /** How fast (px/s) its tray is moving as it's rolled. */
  trayVelocity: Point;
}

/** Each piece of a roll sets off this long after the one before it. */
const STAGGER_MS = 90;

/**
 * Draws a die or chip into its slot's canvas: thrown or carried in if it has
 * just arrived, else drawn at rest once it's scrolled near; then, once
 * `release` is given, rolled where it lies.
 */
function usePiece(
  look: DieLook,
  {
    entrance,
    mine,
    index,
    seed,
    eager = false,
    release,
    onEntered,
    onLanded,
  }: {
    entrance: Entrance;
    mine: boolean;
    index: number;
    seed: string;
    eager?: boolean;
    release?: Release | undefined;
    onEntered?: (() => void) | undefined;
    onLanded?: (() => void) | undefined;
  },
) {
  const slot = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const use3dDice = useQuery(threeDimensionalDice);
  const [pieceSnapshot, sendPiece] = useMachine(pieceMachine);
  /** The die once it's in its slot; null if it's drawn flat. */
  const entered = useRef<Promise<Die | null> | null>(null);
  const initial = useRef({ look, entrance, mine, index, seed, eager });
  const enter = useEffectEvent(() => onEntered?.());
  const land = useEffectEvent(() => onLanded?.());

  useEffect(() => {
    if (!use3dDice) {
      sendPiece({ type: "FLAT" });
      enter();
      return;
    }
    const { look, entrance, mine, index, seed, eager } = initial.current;
    let gone = false;
    let die: Die | undefined;
    const delay = index * STAGGER_MS;
    const moving = entrance !== "rest" && !reducedMotion.matches;
    const show = async () => {
      if (gone) return null;
      if (!canvas.current) return null;
      const dice = await loadDice();
      if (gone || !dice || !canvas.current) {
        if (!gone && (!dice || !canvas.current)) sendPiece({ type: "FLAT" });
        return null;
      }
      die = new dice.Die(canvas.current, look);
      if (moving) {
        sendPiece({ type: "ENTER", moving: true });
        const from = throwFrom(slot.current!, mine);
        await (entrance === "glide" ? die.glideIn(from, delay) : die.throwIn(from, delay, seed));
      } else die.rest();
      if (!gone) sendPiece({ type: "LANDED" });
      return die;
    };
    // A piece that has just arrived is drawn now; older ones wait until they're scrolled near.
    let stopWaiting: (() => void) | undefined;
    if (entrance !== "rest" || eager) entered.current = show();
    else {
      void loadDice();
      entered.current = new Promise((resolve) => {
        stopWaiting = whenNear(slot.current!, () => { resolve(show()); });
      });
    }
    const enteredDie = entered.current ?? Promise.resolve(null);
    void enteredDie.then(() => !gone && enter());
    return () => {
      gone = true;
      stopWaiting?.();
      die?.dispose();
    };
  }, [sendPiece, use3dDice]);

  const releaseSeed = release?.seed;
  const released = useEffectEvent(() => release);
  useEffect(() => {
    const release = released();
    if (!release) return;
    let gone = false;
    const enteredDie = entered.current ?? Promise.resolve(null);
    void enteredDie.then(async (die) => {
      if (gone) return;
      if (die) {
        sendPiece({ type: "MOVING" });
        const delay = initial.current.index * STAGGER_MS;
        await die.rollInPlace(release.value, release.seed, delay, release.trayVelocity);
        if (gone) return;
        sendPiece({ type: "LANDED" });
      }
      land();
    });
    return () => {
      gone = true;
    };
  }, [releaseSeed, sendPiece]);

  const phase: Phase = use3dDice
    ? pieceSnapshot.matches("flat")
      ? "flat"
      : pieceSnapshot.matches("moving")
        ? "moving"
        : pieceSnapshot.matches("landed")
          ? "landed"
          : "pending"
    : "flat";
  return { slot, canvas, phase };
}

/** A piece's face: its canvas, or drawn flat as `flat`. */
function PieceFace({
  phase,
  canvas,
  flat,
}: {
  phase: Phase;
  canvas: RefObject<HTMLCanvasElement | null>;
  flat: ReactNode;
}) {
  if (phase !== "flat") return <canvas ref={canvas} className="die-canvas" aria-hidden="true" />;
  return (
    <span className="die-value">
      {flat}
    </span>
  );
}

/** Whether a piece is thrown in as its roll arrives, and whether by this device. */
interface Thrown {
  arriving: boolean;
  mine: boolean;
}

/** A number added to a roll in chat, as a chip thrown in with the dice: "+1", or "STR" over "+2". */
export function RollChip({
  value,
  label,
  index,
  arriving,
  mine,
  seed,
  pendingIndex,
}: Thrown & {
  value: number;
  label?: string | undefined;
  index: number;
  seed: string;
  pendingIndex?: number | undefined;
}) {
  const text = chipText(value, label);
  const { slot, canvas, phase } = usePiece(
    { chip: text, colour: CHIP_COLOUR },
    { entrance: arriving ? "throw" : "rest", mine, index, seed, eager: pendingIndex !== undefined },
  );
  return (
    <span
      ref={slot}
      className="die chip"
      data-phase={phase}
      data-sign={chipSign(value)}
      data-pending-index={pendingIndex}
      role="img"
      aria-label={label ? `${label} ${signed(value)}` : signed(value)}
    >
      <PieceFace phase={phase} canvas={canvas} flat={text} />
    </span>
  );
}

/** A die in the pending quick-roll tray: carried in from the pointer, then rolled where it lies when released. */
export function PendingDie({
  sides,
  index,
  release,
  onEntered,
  onLanded,
}: {
  sides: number;
  index: number;
  release?: Release | undefined;
  onEntered: () => void;
  onLanded: () => void;
}) {
  const colour = colourOf(device.value);
  const { slot, canvas, phase } = usePiece(
    { sides, value: Math.ceil(sides / 2), colour },
    { entrance: "glide", mine: true, index, seed: "", release, onEntered, onLanded },
  );
  return (
    <span
      ref={slot}
      className="die pending-die"
      data-phase={phase}
      data-sides={dieShape(sides)}
      data-pending-index={index}
      style={{ "--i": index, ...dieColours(colour) }}
      role="img"
      aria-label={release ? `d${sides}: ${release.value}` : `d${sides}, waiting to roll`}
    >
      <PieceFace phase={phase} canvas={canvas} flat={`d${sides}`} />
    </span>
  );
}

/** Whether a die counts, as its label says: disabled, dropped, or (by default) kept. */
function dieState(die: RolledDie) {
  if (die.disabled) return ", disabled";
  return die.kept ? "" : ", dropped";
}

/** One die of a roll in chat; a roll that has just arrived is thrown into place. */
export function RollDie({
  die,
  index,
  arriving,
  mine,
  seed,
  colour,
  onReroll,
  onToggle,
}: {
  die: RolledDie;
  index: number;
  /** The user's colour, clamped to the shared user-colour range. */
  colour: string;
  arriving: boolean;
  mine: boolean;
  seed: string;
  onReroll?: (() => void) | undefined;
  onToggle?: (() => void) | undefined;
}) {
  const { slot, canvas, phase } = usePiece(
    { sides: die.sides, value: die.value, colour },
    { entrance: arriving ? "throw" : "rest", mine, index, seed },
  );
  const interactive = !!onReroll && (phase === "landed" || phase === "flat");
  const gesture = useThrow({
    onThrow: () => onReroll?.(),
    onAway: rollCarriedDice,
    enabled: interactive,
    ...(onToggle ? { onTap: onToggle } : {}),
  });

  return (

    <span
      ref={slot}
      className="die"
      data-phase={phase}
      data-roll-seed={seed}
      data-sides={dieShape(die.sides)}
      data-kept={die.kept}
      data-exploded={die.exploded}
      data-disabled={die.disabled || undefined}
      role={onReroll ? "button" : "img"}
      tabIndex={onReroll ? 0 : undefined}
      aria-pressed={onToggle ? !die.disabled : undefined}
      style={{ "--i": index, ...dieColours(colour) }}
      aria-label={`d${die.sides}: ${die.value}${dieState(die)}`}
      title={dieTitle(die)}
      {...gesture}
      onKeyDown={(event) => {
        if (interactive && event.shiftKey && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onReroll?.();
        } else if (onToggle && event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        } else gesture.onKeyDown(event);
      }}
    >
      <PieceFace phase={phase} canvas={canvas} flat={die.value} />
    </span>
  );
}
