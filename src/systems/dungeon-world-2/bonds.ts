import { BOND_TEXTS } from "./rulebook";
import { BOND_SPECS } from "./bondSpecs";

const TEXTS = BOND_TEXTS;

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
