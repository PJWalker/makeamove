import { useEffect, useRef, useState } from "react";
import type { Die } from "../dice/notation";
import { lastPointer } from "../ui/pointer";
import { useShake } from "../ui/useShake";
import type { DiceRenderer, Point } from "./diceRenderer";

/** Waiting for the renderer, in the air, at rest, or drawn flat where there's no WebGPU. */
type Phase = "pending" | "flying" | "landed" | "flat";

let renderer: Promise<DiceRenderer | null> | undefined;
let loadedRenderer: DiceRenderer | null = null;
const loadRenderer = () =>
  (renderer ??= import("./diceRenderer")
    .then((m) => m.createDiceRenderer())
    .then((instance) => {
      loadedRenderer = instance;
      return instance;
    })
    .catch(() => null));

export function pickUpRollCard(element: HTMLElement) {
  return loadedRenderer?.pickUp(element) ?? (() => {});
}

/** Where a die thrown into this slot starts: the roller's pointer, or else above the log. */
function throwFrom(slot: HTMLElement, mine: boolean): Point {
  const pointer = mine ? lastPointer() : null;
  if (pointer) return pointer;
  const box = slot.getBoundingClientRect();
  const log = (
    slot.closest(".chat-log, .chat-popup") ?? slot
  ).getBoundingClientRect();
  return {
    x: box.left + box.width / 2 + (Math.random() - 0.5) * 160,
    y: log.top - 40,
  };
}

/** One die of a roll in chat; a roll that has just arrived is thrown into place. */
export function RollDie({
  die,
  index,
  arriving,
  mine,
  seed,
  onReroll,
  onToggle,
}: {
  die: Die;
  index: number;
  arriving: boolean;
  mine: boolean;
  seed: string;
  onReroll?: (() => void) | undefined;
  onToggle?: (() => void) | undefined;
}) {
  const slot = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>(
    "gpu" in navigator ? "pending" : "flat",
  );
  const max = die.value === die.sides && die.sides > 1;
  const min = die.value === 1;
  const interactive = !!onReroll && (phase === "landed" || phase === "flat");
  const shake = useShake({
    onShake: () => onReroll?.(),
    enabled: interactive,
    onPickUp: pickUpRollCard,
    ...(onToggle ? { onTap: onToggle } : {}),
  });

  useEffect(() => {
    if (phase === "flat") return;
    const thrown =
      arriving && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? { from: throwFrom(slot.current!, mine), delay: index * 90 }
        : undefined;
    let gone = false;
    let dispose: (() => void) | undefined;
    void loadRenderer()
      .then((dice) => {
        if (gone) return;
        if (!dice || !slot.current || !canvas.current) return setPhase("flat");
        const tone = max ? "max" : min ? "min" : "plain";
        const mounted = dice.mount(
          canvas.current,
          slot.current,
          { sides: die.sides, value: die.value, tone, seed },
          thrown,
        );
        dispose = mounted.dispose;
        setPhase(thrown ? "flying" : "landed");
        void mounted.landed.then(
          () => !gone && setPhase("landed"),
          () => !gone && setPhase("flat"),
        );
      })
      .catch(() => {
        if (!gone) setPhase("flat");
      });
    return () => {
      gone = true;
      dispose?.();
    };
  }, []);

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
      style={{ "--i": index }}
      aria-label={`d${die.sides}: ${die.value}${die.disabled ? ", disabled" : die.kept ? "" : ", dropped"}`}
      title={`d${die.sides}${die.exploded ? ", exploded" : ""}${die.kept ? "" : ", dropped"}`}
      {...shake}
      onKeyDown={(event) => {
        if (interactive && event.shiftKey && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onReroll?.();
        } else if (onToggle && event.key === "Delete") {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        } else shake.onKeyDown(event);
      }}
    >
      {phase !== "flat" && (
        <canvas ref={canvas} className="die-canvas" aria-hidden="true" />
      )}
      {phase === "flat" && (
        <span className="die-value" aria-hidden="true">
          {die.value}
        </span>
      )}
    </span>
  );
}
