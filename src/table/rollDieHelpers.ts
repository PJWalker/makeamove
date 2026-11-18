import type { Die } from "../features/dice/notation";
import type { DiceRenderer, Piece } from "./diceRenderer";
import { contrastingTextColour } from "../lib/colour";
import { colourOf } from "../scene/presence";
import { device } from "../platform/device";
import { chipText, type TrayPick } from "../features/dice/pool";
import { threeDimensionalDice } from "../workspace/diceRendering";

let renderer: Promise<DiceRenderer | null> | undefined;
let loaded: DiceRenderer | undefined;

export const loadDiceRenderer = () =>
  (renderer ??= import("./diceRenderer")
    .then((module) => (loaded = module.createDiceRenderer()))
    .catch(() => null));

/** Tumbles the dice in a carried copy of `element`; the returned function settles them back. */
export function rollCarriedDice(element: HTMLElement, carrier: HTMLElement) {
  if (!threeDimensionalDice.value) return () => {};
  return (
    loaded?.spin(
      [...element.querySelectorAll("canvas")],
      [...carrier.querySelectorAll("canvas")],
    ) ?? (() => {})
  );
}

/** The shape a die is drawn as: its own for the standard dice, else a generic one ("n"). */
export const dieShape = (sides: number) => ([4, 6, 8, 10, 12, 20].includes(sides) ? sides : "n");

/** The custom properties that colour a die: its body, and a label that reads on it. */
export const dieColours = (colour: string) => ({
  "--die-colour": colour,
  "--die-label-colour": contrastingTextColour(colour),
});

/** Which way a chip's number goes, for its colour. */
export const chipSign = (value: number) => (value < 0 ? "minus" : "plus");

/** A new die or chip held under the pointer, tumbling, until it's let go of. */
export function holdNewPick(pick: TrayPick) {
  const piece: Piece =
    pick.kind === "die"
      ? { sides: pick.sides, value: pick.sides, seed: "" }
      : { chip: chipText(pick.value, pick.kind === "stat" ? pick.stat : undefined), seed: "" };
  const ghost = document.createElement("span");
  ghost.className = "die die-ghost";
  ghost.dataset["phase"] = "flat";
  ghost.setAttribute("aria-hidden", "true");
  if ("chip" in piece) {
    ghost.classList.add("chip");
    ghost.dataset["sign"] = chipSign(pick.kind === "die" ? 0 : pick.value);
  } else {
    ghost.dataset["sides"] = String(dieShape(piece.sides));
    for (const [property, value] of Object.entries(dieColours(colourOf(device.value))))
      ghost.style.setProperty(property, value);
  }
  const value = document.createElement("span");
  value.className = "die-value";
  value.textContent = "chip" in piece ? piece.chip : String(piece.value);
  ghost.append(value);
  document.body.append(ghost);
  let settle: (() => void) | undefined;
  let gone = false;
  if (threeDimensionalDice.value)
    void loadDiceRenderer().then((dice) => {
      if (!threeDimensionalDice.value) return;
      if (!dice || gone) return;
      const canvas = document.createElement("canvas");
      canvas.className = "die-canvas";
      ghost.replaceChildren(canvas);
      dice.mount(canvas, ghost, piece);
      ghost.dataset["phase"] = "landed";
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

/** A die's tooltip: the number it rolled, and whether it exploded or was dropped. */
export function dieTitle(die: Die) {
  return `${die.value}${die.exploded ? ", exploded" : ""}${die.kept ? "" : ", dropped"}`;
}
