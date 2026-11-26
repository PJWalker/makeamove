
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
import { chipLook, looksOf } from "./dice/looks";
import type {PhysicalDie as Die} from "./rollDieHelpers";
import { chipSign, dieColours, dieTitle, CHIP_COLOUR, loadDice, rollCarriedDice } from "./rollDieHelpers";
import type { DieLook, Point } from "./dice/types";
import { pieceMachine } from "./pieceMachine";

/** Waiting for the 3D dice, moving, at rest, or drawn flat. */
type Phase = "flat" | "landed" | "moving" | "pending";

/** How wide a spread (px) other people's dice are thrown in from, and how far above the log. */
const THROW_SPREAD = 160;
const THROW_ABOVE = 40;

/** Where a die thrown into this slot starts: the roller's pointer, or else above the log. */
function throwFrom(slot: HTMLElement, mine: boolean): Point {
  const pointer = mine ? lastPointer() : null;
  if (pointer) return pointer;
  const box = slot.getBoundingClientRect();
  const log = (slot.closest(".chat-log, .chat-popup") ?? slot).getBoundingClientRect();
  return {
    x: box.left + box.width / 2 + (Math.random() - 1 / 2) * THROW_SPREAD,
    y: log.top - THROW_ABOVE,
  };
}

/** How a piece comes to be in its slot: thrown or carried in as it arrives, else there already. */
type Entrance = "glide" | "rest" | "throw";

/** A roll of a die already in its slot, rolled where it lies to show `value`. */
interface Release {
  value: number;
  seed: string;
  /** How fast (px/s) its tray is moving as it's rolled. */
  trayVelocity: Point;
}

/** A release as each piece of a die rolls it: showing face `shown[index]`. */
interface PieceRelease {
  shown: readonly number[];
  seed: string;
  /** How fast (px/s) its tray is moving as it's rolled. */
  trayVelocity: Point;
}

/** Each piece of a roll sets off this long after the one before it. */
const STAGGER_MS = 90;

/**
 * Draws the pieces of a die or chip (one, or a d100's two d10s) into their
 * canvases in its slot: thrown or carried in if it has just arrived, else
 * drawn at rest once it's scrolled near; then, once `release` is given,
 * rolled where they lie.
 */
function usePiece(
  looks: readonly DieLook[],
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
    release?: PieceRelease | undefined;
    onEntered?: (() => void) | undefined;
    onLanded?: (() => void) | undefined;
  },
) {
  const slot = useRef<HTMLSpanElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const use3dDice = useQuery(threeDimensionalDice);
  const [pieceSnapshot, sendPiece] = useMachine(pieceMachine);
  /** Its pieces once they're in their slots; null if they're drawn flat. */
  const entered = useRef<Promise<Die[] | null> | null>(null);
  const initial = useRef({ looks, entrance, mine, index, seed, eager });
  const enter = useEffectEvent(() => onEntered?.());
  const land = useEffectEvent(() => onLanded?.());

  useEffect(() => {
    if (!use3dDice) {
      sendPiece({ type: "FLAT" });
      enter();
      return;
    }
    const { looks, entrance, mine, index, seed, eager } = initial.current;
    let gone = false;
    let pieces: Die[] = [];
    // A glided-in die is carried in by its own click, so it sets off straight away.
    const delay = entrance === "glide" ? 0 : index * STAGGER_MS;
    const moving = entrance !== "rest" && !reducedMotion.matches;
    const drawnIn = () => {
      const drawn = looks.map((_, piece) => canvases.current[piece]);
      return drawn.every((canvas): canvas is HTMLCanvasElement => Boolean(canvas)) ? drawn : null;
    };
    const show = async () => {
      if (gone || !drawnIn()) return null;
      const dice = await loadDice();
      const canvasesNow = drawnIn();
      if (gone || !dice || !canvasesNow) {
        if (!gone) sendPiece({ type: "FLAT" });
        return null;
      }
      pieces = canvasesNow.map((canvas, piece) => new dice.Die(canvas, looks[piece]!));
      if (moving) {
        sendPiece({ type: "ENTER", moving: true });
        const from = throwFrom(slot.current!, mine);
        await Promise.all(
          pieces.map((die, piece) =>
            entrance === "glide"
              ? die.glideIn(from, delay)
              : die.throwIn(from, delay, pieceSeed(seed, piece)),
          ),
        );
      } else for (const die of pieces) die.rest();
      if (!gone) sendPiece({ type: "LANDED" });
      return pieces;
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
      for (const die of pieces) die.dispose();
    };
  }, [sendPiece, use3dDice]);

  const releaseSeed = release?.seed;
  const released = useEffectEvent(() => release);
  useEffect(() => {
    const release = released();
    if (!release) return;
    let gone = false;
    const enteredDie = entered.current ?? Promise.resolve(null);
    void enteredDie.then(async (pieces) => {
      if (gone) return;
      if (pieces) {
        sendPiece({ type: "MOVING" });
        const delay = initial.current.index * STAGGER_MS;
        await Promise.all(
          pieces.map((die, piece) =>
            die.rollInPlace(
              release.shown[piece]!,
              pieceSeed(release.seed, piece),
              delay,
              release.trayVelocity,
            ),
          ),
        );
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
  return { slot, canvases, phase };
}

/** The seed a piece of a die rolls by: the die's own for its first, so the pieces don't roll alike. */
const pieceSeed = (seed: string, piece: number) => (piece === 0 ? seed : `${seed}:${String(piece)}`);

/** A die's pieces, each in its own slot: its canvas, or drawn flat showing its face, or `flat` if given. */
function PieceFaces({
  looks,
  phase,
  canvases,
  flat,
}: {
  looks: readonly DieLook[];
  phase: Phase;
  canvases: RefObject<(HTMLCanvasElement | null)[]>;
  flat?: readonly ReactNode[] | undefined;
}) {
  return looks.map((look, piece) => (
    <span
      // eslint-disable-next-line react-doctor/no-array-index-key, @eslint-react/no-array-index-key -- A die's pieces never change in number or order.
      key={piece}
      className="die-piece"
      data-form={look.form}
      data-sides={look.form === "die" ? look.sides : undefined}
    >
      {phase === "flat" ? (
        <span className="die-value">{flat ? flat[piece] : look.label(look.shown)}</span>
      ) : (
        <canvas
          ref={(canvas) => {
            canvases.current[piece] = canvas;
          }}
          className="die-canvas"
          aria-hidden="true"
        />
      )}
    </span>
  ));
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
  const looks = [chipLook(chipText(value, label), CHIP_COLOUR)];
  const { slot, canvases, phase } = usePiece(looks, {
    entrance: arriving ? "throw" : "rest",
    mine,
    index,
    seed,
    eager: pendingIndex !== undefined,
  });
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
      <PieceFaces looks={looks} phase={phase} canvases={canvases} />
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
  const looks = looksOf(sides, sides, colour);
  const { slot, canvases, phase } = usePiece(looks, {
    entrance: "glide",
    mine: true,
    index,
    seed: "",
    release: release && {
      ...release,
      shown: looksOf(sides, release.value, colour).map((look) => look.shown),
    },
    onEntered,
    onLanded,
  });
  return (
    <span
      ref={slot}
      className="die pending-die"
      data-phase={phase}
      data-pending-index={index}
      style={{ "--i": index, ...dieColours(colour) }}
      role="img"
      aria-label={release ? `d${String(sides)}: ${String(release.value)}` : `d${String(sides)}, waiting to roll`}
    >
      <PieceFaces looks={looks} phase={phase} canvases={canvases} flat={[`d${String(sides)}`]} />
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
  const looks = looksOf(die.sides, die.value, colour);
  const { slot, canvases, phase } = usePiece(looks, {
    entrance: arriving ? "throw" : "rest",
    mine,
    index,
    seed,
  });
  const interactive = Boolean(onReroll) && (phase === "landed" || phase === "flat");
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
      data-kept={die.kept}
      data-exploded={die.exploded}
      data-disabled={die.disabled || undefined}
      role={onReroll ? "button" : "img"}
      tabIndex={onReroll ? 0 : undefined}
      aria-pressed={onToggle ? !die.disabled : undefined}
      style={{ "--i": index, ...dieColours(colour) }}
      aria-label={`d${String(die.sides)}: ${String(die.value)}${dieState(die)}`}
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
      <PieceFaces looks={looks} phase={phase} canvases={canvases} />
    </span>
  );
}
