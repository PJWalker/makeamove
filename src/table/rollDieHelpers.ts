import type { Die } from "../features/dice/notation";
import { contrastingTextColour } from "../lib/colour";
import { colourOf } from "../scene/presence";
import { device } from "../platform/device";
import { chipText } from "../features/dice/pool";
import type { TrayPick } from "../features/dice/pool";
import { threeDimensionalDice } from "../workspace/diceRendering";
import { chipLook, looksOf } from "./dice/looks";
import type { DieLook } from "./dice/types";

/** The 3D dice, once they've loaded. */
type Dice = Pick<typeof import("./dice"), "Die" | "dieOf">;
/** A die drawn in 3D, in its slot (table/dice/die.ts). */
export type PhysicalDie = InstanceType<Dice["Die"]>;

let loading: Promise<Dice | null> | undefined;
let loaded: Dice | undefined;

/** The 3D dice, loaded on first use; null where they can't be. */
export const loadDice = () =>
  (loading ??= import("./dice")
    .then(({ Die, dieOf }) => (loaded = { Die, dieOf }))
    .catch((error: unknown) => {
      console.error("The 3D dice couldn't be loaded; they're drawn flat.", error);
      return null;
    }));

/** Each die drawn in `element`'s canvases, with its canvas in the carried copy `carrier`. */
function carriedDice(element: HTMLElement, carrier: HTMLElement) {
  if (!threeDimensionalDice.value || !loaded) return [];
  const copies = carrier.querySelectorAll("canvas");
  return [...element.querySelectorAll("canvas")].flatMap((canvas, index) => {
    const die = loaded!.dieOf(canvas);
    const copy = copies[index];
    return die && copy ? [{ die, copy }] : [];
  });
}

/** Keeps the dice still moving in `element` on its carried copy `carrier`; the returned function lets them go. */
export function carryDice(element: HTMLElement, carrier: HTMLElement) {
  const releases = carriedDice(element, carrier).map(({ die, copy }) => die.carry(copy));
  return () => {
    for (const release of releases) release();
  };
}

/** Tumbles the dice at rest in a carried copy of `element`; the returned function settles them back. */
export function rollCarriedDice(element: HTMLElement, carrier: HTMLElement) {
  const settles = carriedDice(element, carrier).flatMap(({ die, copy }) =>
    die.moving ? [] : [die.tumble(copy)],
  );
  return () => {
    for (const settle of settles) settle();
  };
}

/** The custom properties that colour a die: its body, and a label that reads on it. */
export const dieColours = (colour: string) => ({
  "--die-colour": colour,
  "--die-label-colour": contrastingTextColour(colour),
});

/** A chip's colour, set by its sign (table/RollDie.css). */
export const CHIP_COLOUR = "var(--chip-face)";

/** Which way a chip's number goes, for its colour. */
export const chipSign = (value: number) => (value < 0 ? "minus" : "plus");

/** A piece of a die in its own slot, drawn flat, as table/RollDie.tsx draws it. */
function flatPiece(look: DieLook) {
  const piece = document.createElement("span");
  piece.className = "die-piece";
  piece.dataset["form"] = look.form;
  if (look.form === "die") piece.dataset["sides"] = String(look.sides);
  const value = document.createElement("span");
  value.className = "die-value";
  value.textContent = look.label(look.shown);
  piece.append(value);
  return piece;
}

/** A new die or chip held under the pointer, tumbling, until it's let go of. */
export function holdNewPick(pick: TrayPick) {
  const colour = colourOf(device.value);
  const looks =
    pick.kind === "die"
      ? looksOf(pick.sides, pick.sides, colour)
      : [chipLook(chipText(pick.value, pick.kind === "stat" ? pick.stat : undefined), CHIP_COLOUR)];
  const ghost = document.createElement("span");
  ghost.className = "die die-ghost";
  ghost.dataset["phase"] = "flat";
  ghost.setAttribute("aria-hidden", "true");
  if (pick.kind === "die")
    for (const [property, value] of Object.entries(dieColours(colour)))
      ghost.style.setProperty(property, value);
  else {
    ghost.classList.add("chip");
    ghost.dataset["sign"] = chipSign(pick.value);
  }
  const pieces = looks.map((look) => flatPiece(look));
  ghost.append(...pieces);
  document.body.append(ghost);
  let dice: PhysicalDie[] = [];
  let gone = false;
  if (threeDimensionalDice.value)
    void loadDice().then((physical) => {
      if (!threeDimensionalDice.value || !physical || gone) return;
      ghost.dataset["phase"] = "landed";
      dice = pieces.map((piece, index) => {
        const canvas = document.createElement("canvas");
        canvas.className = "die-canvas";
        piece.replaceChildren(canvas);
        const die = new physical.Die(canvas, looks[index]!);
        die.rest();
        die.tumble();
        return die;
      });
    });
  return {
    move(x: number, y: number) {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    },
    remove() {
      gone = true;
      for (const die of dice) die.dispose();
      ghost.remove();
    },
  };
}

/** A die's tooltip: the number it rolled, and whether it exploded or was dropped. */
export function dieTitle(die: Die) {
  return `${die.value}${die.exploded ? ", exploded" : ""}${die.kept ? "" : ", dropped"}`;
}
