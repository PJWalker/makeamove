/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The die's accessible image is canvas-rendered and has no img source. */
import { useEffect, useRef, useState } from "react";
import type { Die } from "../features/dice/notation";
import { lastPointer } from "../ui/pointer";
import { useThrow } from "../ui/useThrow";
import { whenNear } from "../ui/whenNear";
import type { DiceRenderer, Piece, Point } from "./diceRenderer";
import { contrastingTextColour } from "../lib/colour";
import { colourOf } from "../scene/presence";
import { device } from "../platform/device";
import { chipText, signed } from "../features/dice/pool";
import { useQuery } from "../ui/useQuery";
import { threeDimensionalDice } from "../workspace/diceRendering";
import { chipSign, dieTitle, loadDiceRenderer, rollCarriedDice } from "./rollDieHelpers";

/** Waiting for the renderer, in the air, at rest, drawn flat, or disabled by the player. */
type Phase = "pending" | "flying" | "landed" | "flat" | "disabled";

/** Where a die thrown into this slot starts: the roller's pointer, or else above the log. */
function throwFrom(slot: HTMLElement, mine: boolean, origin?: Point): Point {
  if (origin) return origin;
  const pointer = mine ? lastPointer() : null;
  if (pointer) return pointer;
  const box = slot.getBoundingClientRect();
  const log = (slot.closest(".chat-log, .chat-popup") ?? slot).getBoundingClientRect();
  return {
    x: box.left + box.width / 2 + (Math.random() - 0.5) * 160,
    y: log.top - 40,
  };
}

/**
 * Draws a die or chip of a roll in chat into its slot's canvas: thrown in if
 * the roll has just arrived, else drawn at rest once it's scrolled near.
 */
function useLanding(
  piece: Piece,
  {
    arriving,
    mine,
    index,
    origin,
    releaseValue,
    releaseSeed,
    trayVelocity,
    onLanded,
    entryKey,
    onEntered,
    eager,
  }: Thrown & {
    index: number;
    origin?: Point | undefined;
    releaseValue?: number | undefined;
    releaseSeed?: string | undefined;
    trayVelocity?: Point | undefined;
    onLanded?: (() => void) | undefined;
    entryKey?: string | undefined;
    onEntered?: ((key: string) => void) | undefined;
    eager?: boolean | undefined;
  },
) {
  const slot = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const use3dDice = useQuery(threeDimensionalDice);
  const [phase, setPhase] = useState<Phase>(use3dDice ? "pending" : "disabled");
  const [previousUse3dDice, setPreviousUse3dDice] = useState(use3dDice);
  if (previousUse3dDice !== use3dDice) {
    setPreviousUse3dDice(use3dDice);
    setPhase(use3dDice ? "pending" : "disabled");
  }
  const [arrivalOrigin, setArrivalOrigin] = useState(origin);
  if (origin && !arrivalOrigin) setArrivalOrigin(origin);
  const initial = useRef({ piece, arriving, mine, index, entryKey });
  const onLandedRef = useRef(onLanded);
  const onEnteredRef = useRef(onEntered);
  const releaseRef = useRef<{ value: number; seed: string; trayVelocity: Point } | null>(null);
  const startReleaseRef = useRef<() => void>(() => {});
  useEffect(() => {
    onLandedRef.current = onLanded;
    onEnteredRef.current = onEntered;
    releaseRef.current =
      releaseValue === undefined
        ? null
        : {
            value: releaseValue,
            seed: releaseSeed ?? piece.seed,
            trayVelocity: trayVelocity ?? { x: 0, y: 0 },
          };
    if (releaseValue !== undefined) {
      if (!use3dDice) onLandedRef.current?.();
      else startReleaseRef.current();
    }
  }, [onLanded, onEntered, releaseValue, releaseSeed, trayVelocity, piece.seed, use3dDice]);

  useEffect(() => {
    const { piece, arriving: wasArriving, mine, index, entryKey: pendingKey } = initial.current;
    if (!use3dDice) {
      if (wasArriving && pendingKey) onEnteredRef.current?.(pendingKey);
      return;
    }
    const thrown =
      wasArriving && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? { from: throwFrom(slot.current!, mine, arrivalOrigin), delay: index * 90 }
        : undefined;
    let gone = false;
    let dispose: (() => void) | undefined;
    let diceRenderer: DiceRenderer | undefined;
    let entryComplete = false;
    let releaseStarted = false;
    const startRelease = () => {
      const release = releaseRef.current;
      if (gone || !entryComplete || releaseStarted || !release || !diceRenderer) return;
      if (!slot.current || !canvas.current || !("sides" in piece)) {
        onLandedRef.current?.();
        return;
      }
      releaseStarted = true;
      const mounted = diceRenderer.rollInTray(
        canvas.current,
        slot.current,
        { sides: piece.sides, value: release.value, seed: release.seed },
        index * 90,
        release.trayVelocity,
      );
      if (!mounted) {
        onLandedRef.current?.();
        return;
      }
      dispose = mounted.dispose;
      void mounted.started.then(() => !gone && setPhase("flying"));
      void mounted.landed.then(() => {
        if (gone) return;
        setPhase("landed");
        onLandedRef.current?.();
      });
    };
    startReleaseRef.current = startRelease;
    const draw = () =>
      void loadDiceRenderer()
        .then((loadedDice) => {
          if (gone) return;
          if (!loadedDice || !slot.current || !canvas.current) {
            setPhase("flat");
            entryComplete = true;
            if (wasArriving && pendingKey) onEnteredRef.current?.(pendingKey);
            if (releaseRef.current) onLandedRef.current?.();
            return;
          }
          diceRenderer = loadedDice;
          const mounted =
            wasArriving && pendingKey && thrown
              ? loadedDice.glideIn(canvas.current, slot.current, piece, thrown.from, thrown.delay)
              : loadedDice.mount(canvas.current, slot.current, piece, thrown);
          dispose = mounted.dispose;
          if (thrown) void mounted.started.then(() => !gone && setPhase("flying"));
          else setPhase("landed");
          void mounted.landed.then(() => {
            if (gone) return;
            setPhase("landed");
            entryComplete = true;
            if (wasArriving && pendingKey) onEnteredRef.current?.(pendingKey);
            startRelease();
          });
        })
        .catch(() => {
          if (!gone) {
            setPhase("flat");
            entryComplete = true;
            if (wasArriving && pendingKey) onEnteredRef.current?.(pendingKey);
            if (releaseRef.current) onLandedRef.current?.();
          }
        });
    // A roll that has just arrived is drawn now; older ones wait until they're scrolled near.
    let stopWaiting: (() => void) | undefined;
    if (wasArriving || eager) draw();
    else {
      void loadDiceRenderer();
      stopWaiting = whenNear(slot.current!, draw);
    }
    return () => {
      gone = true;
      startReleaseRef.current = () => {};
      stopWaiting?.();
      dispose?.();
    };
  }, [use3dDice, arrivalOrigin, eager]);

  return {
    slot,
    canvas,
    phase: !use3dDice ? "flat" : phase === "disabled" ? "pending" : phase,
  };
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
  origin,
  pendingIndex,
}: {
  value: number;
  label?: string | undefined;
  index: number;
  seed: string;
  origin?: Point | undefined;
  pendingIndex?: number | undefined;
} & Thrown) {
  const text = chipText(value, label);
  const { slot, canvas, phase } = useLanding(
    { chip: text, seed },
    { arriving, mine, index, origin },
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
      {phase !== "flat" && <canvas ref={canvas} className="die-canvas" aria-hidden="true" />}
      {phase === "flat" && (
        <span className="die-value" aria-hidden="true">
          {text}
        </span>
      )}
    </span>
  );
}

/** A die in the pending quick-roll tray, rolled in place when released. */
export function PendingDie({
  sides,
  index,
  seed,
  entryKey,
  releaseValue,
  releaseSeed,
  trayVelocity,
  onLanded,
  onEntered,
  eager = true,
}: {
  sides: number;
  index: number;
  seed: string;
  entryKey: string;
  releaseValue?: number | undefined;
  releaseSeed?: string | undefined;
  trayVelocity?: Point | undefined;
  onLanded?: (() => void) | undefined;
  onEntered?: (key: string) => void;
  eager?: boolean | undefined;
}) {
  const piece = { sides, value: Math.ceil(sides / 2), seed };
  const { slot, canvas, phase } = useLanding(piece, {
    arriving: true,
    mine: true,
    index,
    entryKey,
    releaseValue,
    releaseSeed,
    trayVelocity,
    onLanded,
    onEntered,
    eager,
  });
  const colour = colourOf(device.value);
  return (
    <span
      ref={slot}
      className="die pending-die"
      data-phase={phase}
      data-sides={[4, 6, 8, 10, 12, 20].includes(sides) ? sides : "n"}
      data-pending-index={index}
      style={{
        "--i": index,
        "--die-colour": colour,
        "--die-label-colour": contrastingTextColour(colour),
      }}
      role="img"
      aria-label={
        releaseValue === undefined ? `d${sides}, waiting to roll` : `d${sides}: ${releaseValue}`
      }
    >
      {phase !== "flat" && <canvas ref={canvas} className="die-canvas" aria-hidden="true" />}
      {phase === "flat" && (
        <span className="die-value" aria-hidden="true">
          d{sides}
        </span>
      )}
    </span>
  );
}

/** One die of a roll in chat; a roll that has just arrived is thrown into place. */
export function RollDie({
  die,
  index,
  arriving,
  mine,
  seed,
  colour,
  origin,
  onReroll,
  onToggle,
}: {
  die: Die;
  index: number;
  /** The user's colour, clamped to the shared user-colour range. */
  colour: string;
  arriving: boolean;
  mine: boolean;
  seed: string;
  origin?: Point | undefined;
  onReroll?: (() => void) | undefined;
  onToggle?: (() => void) | undefined;
}) {
  const { slot, canvas, phase } = useLanding(
    { sides: die.sides, value: die.value, seed },
    { arriving, mine, index, origin },
  );
  const interactive = !!onReroll && (phase === "landed" || phase === "flat");
  const gesture = useThrow({
    onThrow: () => onReroll?.(),
    onAway: rollCarriedDice,
    enabled: interactive,
    ...(onToggle ? { onTap: onToggle } : {}),
  });

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- The role is button when rerolling is enabled.
    <span
      ref={slot}
      className="die"
      data-phase={phase}
      data-roll-seed={seed}
      data-sides={[4, 6, 8, 10, 12, 20].includes(die.sides) ? die.sides : "n"}
      data-kept={die.kept}
      data-exploded={die.exploded}
      data-disabled={die.disabled || undefined}
      role={onReroll ? "button" : "img"}
      tabIndex={onReroll ? 0 : undefined}
      aria-pressed={onToggle ? !die.disabled : undefined}
      style={{
        "--i": index,
        "--die-colour": colour,
        "--die-label-colour": contrastingTextColour(colour),
      }}
      aria-label={`d${die.sides}: ${die.value}${die.disabled ? ", disabled" : die.kept ? "" : ", dropped"}`}
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
      {phase !== "flat" && <canvas ref={canvas} className="die-canvas" aria-hidden="true" />}
      {phase === "flat" && (
        <span className="die-value" aria-hidden="true">
          {die.value}
        </span>
      )}
    </span>
  );
}
