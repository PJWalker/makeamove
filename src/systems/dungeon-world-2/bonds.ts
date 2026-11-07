import { sourceMoveText } from "./paths";

const BOND_SPECS = [
  {
    id: "champions", name: "Champions",
    moves: ["One Vision", "Return the Favor", "You Cannot Kill an Idea", "United We Stand"],
  },
  {
    id: "comrades-in-arms", name: "Comrades in Arms",
    moves: ["Back to Back", "Killer Combo", "Let It All Out", "Training Exercise"],
  },
  {
    id: "enthusiasts", name: "Enthusiasts",
    moves: ["Joy of Discovery", "Great Minds", "Paired Project", "Specialists"],
  },
  {
    id: "student-and-teacher", name: "Student & Teacher",
    moves: ["Words of Wisdom", "Heroic Sacrifice", "Just Like We Practiced", "The Sincerest Form of Flattery"],
  },
  {
    id: "rivals", name: "Rivals",
    moves: ["Always a Competition", "I Can Do That", "Still Counts as One", "Try to Keep Up"],
  },
  {
    id: "romantic-partners", name: "Romantic Partners",
    moves: ["Always on My Mind", "Handfasting", "Let Me Tell You All About Them", "Together Forever"],
  },
  {
    id: "siblings", name: "Siblings",
    moves: ["Look Out For Each Other", "I Carry Your Heart with Me", "Push Your Buttons", "Shared Past"],
  },
] as const;

export const BONDS = BOND_SPECS.map((bond) => ({
  ...bond,
  moves: bond.moves.map((name, index) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
    name,
    starting: index === 0,
  })),
  text: sourceMoveText(bond.name, 4),
}));

export type Dw2Bond = (typeof BONDS)[number];