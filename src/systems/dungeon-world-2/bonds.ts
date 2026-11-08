import { BOND_SPECS } from "./bondSpecs";
import { bondTexts } from "./paths.macro" with { type: "macro" };

const TEXTS = bondTexts();

export const BONDS = BOND_SPECS.map((bond) => ({
  ...bond,
  moves: bond.moves.map((name, index) => ({
    id: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, ""),
    name,
    starting: index === 0,
  })),
  text: TEXTS[bond.id] ?? "",
}));
