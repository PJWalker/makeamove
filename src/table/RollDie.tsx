import { useEffect, useRef, useState } from "react";
import type { Die } from "../features/dice/notation";
import { lastPointer } from "../ui/pointer";
import { useThrow } from "../ui/useThrow";
import { whenNear } from "../ui/whenNear";
import type { DiceRenderer, Piece, Point } from "./diceRenderer";
import { backdropColour } from "../lib/colour";
import { colourOf } from "../scene/presence";
import { device } from "../platform/device";
import { chipText, signed, type TrayPick } from "../features/dice/pool";

/** Waiting for the renderer, in the air, at rest, or drawn flat where the browser can't draw 3D at all. */
type Phase = "pending" | "flying" | "landed" | "flat";

let renderer: Promise<DiceRenderer | null> | undefined;
let loaded: DiceRenderer | undefined;
const loadRenderer = () =>
  (renderer ??= import("./diceRenderer")
    .then((m) => (loaded = m.createDiceRenderer()))
    .catch(() => null));

/** A player's colour as a die's body: dark and muted enough to carry light numbers. */
export const dieColour = (player: string) => backdropColour(player, 0.42, 0.1);

/** Tumbles the dice in a carried copy of `element`; the returned function settles them back. */
export function rollCarriedDice(element: HTMLElement, carrier: HTMLElement) {
  return (
    loaded?.spin(
      [...element.querySelectorAll("canvas")],
      [...carrier.querySelectorAll("canvas")],
    ) ?? (() => {})
  );
}

/** Which way a chip's number goes, for its colour. */
const chipSign = (value: number) => (value < 0 ? "minus" : "plus");

/** A new die or chip held under the pointer, tumbling, until it's let go of. */
export function holdNewPick(pick: TrayPick) {
  const piece: Piece =
    pick.kind === "die"
      ? { sides: pick.sides, value: pick.sides, seed: "" }
      : { chip: chipText(pick.value, pick.kind === "stat" ? pick.stat : undefined), seed: "" };
  const ghost = document.createElement("span");
  ghost.className = "die die-ghost";
  ghost.dataset.phase = "flat";
  ghost.setAttribute("aria-hidden", "true");
  if ("chip" in piece) {
    ghost.classList.add("chip");
    ghost.dataset.sign = chipSign(pick.kind === "die" ? 0 : pick.value);
  } else {
    ghost.dataset.sides = [4, 6, 8, 10, 12, 20].includes(piece.sides) ? String(piece.sides) : "n";
    ghost.style.setProperty("--die-colour", dieColour(colourOf(device.value)));
  }
  const value = document.createElement("span");
  value.className = "die-value";
  value.textContent = "chip" in piece ? piece.chip : String(piece.value);
  ghost.append(value);
  document.body.append(ghost);
  let settle: (() => void) | undefined;
  let gone = false;
  void loadRenderer().then((dice) => {
    if (!dice || gone) return;
    const canvas = document.createElement("canvas");
    canvas.className = "die-canvas";
    // In place before it's drawn, so it's drawn in the ghost's colours.
    ghost.replaceChildren(canvas);
    dice.mount(canvas, ghost, piece);
    ghost.dataset.phase = "landed";
    settle = dice.spin([canvas], [canvas]);
  });
  return {
    move(x: number, y: number) {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    },
    remove() {
      gone = true;
      settle?.();
      ghost.remove();
    },
  };
}

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

/** A die's tooltip: the number it rolled, and whether it exploded or was dropped. */
export function dieTitle(die: Die) {
  return `${die.value}${die.exploded ? ", exploded" : ""}${die.kept ? "" : ", dropped"}`;
}

/**
 * Draws a die or chip of a roll in chat into its slot's canvas: thrown in if
 * the roll has just arrived, else drawn at rest once it's scrolled near.
 */
function useLanding(piece: Piece, { arriving, mine, index }: Thrown & { index: number }) {
  const slot = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("pending");
  const initial = useRef({ piece, arriving, mine, index });

  useEffect(() => {
    const { piece, arriving, mine, index } = initial.current;
    const thrown =
      arriving && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? { from: throwFrom(slot.current!, mine), delay: index * 90 }
        : undefined;
    let gone = false;
    let dispose: (() => void) | undefined;
    const draw = () =>
      void loadRenderer()
        .then((dice) => {
          if (gone) return;
          if (!dice || !slot.current || !canvas.current) return setPhase("flat");
          const mounted = dice.mount(canvas.current, slot.current, piece, thrown);
          dispose = mounted.dispose;
          setPhase(thrown ? "flying" : "landed");
          void mounted.landed.then(() => !gone && setPhase("landed"));
        })
        .catch(() => {
          if (!gone) setPhase("flat");
        });
    // A roll that has just arrived is drawn now; older ones wait until they're scrolled near.
    let stopWaiting: (() => void) | undefined;
    if (arriving) draw();
    else {
      void loadRenderer();
      stopWaiting = whenNear(slot.current!, draw);
    }
    return () => {
      gone = true;
      stopWaiting?.();
      dispose?.();
    };
  }, []);

  return { slot, canvas, phase };
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
}: { value: number; label?: string | undefined; index: number; seed: string } & Thrown) {
  const text = chipText(value, label);
  const { slot, canvas, phase } = useLanding({ chip: text, seed }, { arriving, mine, index });
  return (
    <span
      ref={slot}
      className="die chip"
      data-phase={phase}
      data-sign={chipSign(value)}
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
  die: Die;
  index: number;
  /** The die's body colour (see dieColour). */
  colour: string;
  arriving: boolean;
  mine: boolean;
  seed: string;
  onReroll?: (() => void) | undefined;
  onToggle?: (() => void) | undefined;
}) {
  const { slot, canvas, phase } = useLanding(
    { sides: die.sides, value: die.value, seed },
    { arriving, mine, index },
  );
  const max = die.value === die.sides && die.sides > 1;
  const min = die.value === 1;
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
      data-sides={[4, 6, 8, 10, 12, 20].includes(die.sides) ? die.sides : "n"}
      data-kept={die.kept}
      data-max={max}
      data-min={min}
      data-exploded={die.exploded}
      data-disabled={die.disabled || undefined}
      role={onReroll ? "button" : undefined}
      tabIndex={onReroll ? 0 : undefined}
      aria-pressed={onToggle ? !die.disabled : undefined}
      style={{ "--i": index, "--die-colour": colour }}
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
