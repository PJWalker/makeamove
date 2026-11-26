import { BOND_TEXTS } from "./rulebook";
import BOND_SPECS from "./bondSpecs";

const TEXTS = BOND_TEXTS;

const BONDS = BOND_SPECS.map((bond) => ({
  ...bond,
  moves: bond.moves.map((name, index) => ({
    id: name
      .toLowerCase()
      .replaceAll(/[^\da-z]+/g, "-")
      .replace(/-$/, ""),
    name,
    starting: index === 0,
  })),
  text: TEXTS[bond.id] ?? "",
}));

export default BONDS;
