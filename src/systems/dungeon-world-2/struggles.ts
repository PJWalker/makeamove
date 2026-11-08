import { sourceMoveText } from "./paths";

interface StruggleSpec {
  id: string;
  name: string;
  track?: { name: string; initial?: number; max: number };
}

const STRUGGLE_SPECS: StruggleSpec[] = [
  { id: "amnesia", name: "Amnesia", track: { name: "Memories", max: 5 } },
  { id: "betrayed", name: "Betrayed" },
  { id: "caretaker", name: "Caretaker" },
  { id: "coward", name: "Coward" },
  { id: "dark-whisperer", name: "Dark Whisperer", track: { name: "Whispers", max: 5 } },
  { id: "disillusioned", name: "Disillusioned" },
  { id: "doomed", name: "Doomed", track: { name: "Doom", max: 5 } },
  { id: "emotionally-scarred", name: "Emotionally Scarred" },
  { id: "folk-hero", name: "Folk Hero" },
  { id: "forbidden-romance", name: "Forbidden Romance" },
  { id: "hunted", name: "Hunted", track: { name: "Heat", max: 3 } },
  { id: "indebted", name: "Indebted", track: { name: "Debt", max: 5 } },
  { id: "innocent", name: "Innocent" },
  { id: "loner", name: "Loner" },
  { id: "lost-heritage", name: "Lost Heritage" },
  { id: "ominous-dreams", name: "Ominous Dreams", track: { name: "Wyrd", max: 3 } },
  { id: "pariah", name: "Pariah" },
  { id: "reformed", name: "Reformed", track: { name: "Guilt", initial: 2, max: 3 } },
  { id: "renowned", name: "Renowned", track: { name: "Fame", initial: 1, max: 3 } },
  { id: "secret-identity", name: "Secret Identity" },
  { id: "treasure-obsession", name: "Treasure Obsession", track: { name: "Leads", max: 5 } },
  { id: "vengeful", name: "Vengeful" },
];

export const STRUGGLES = STRUGGLE_SPECS.map((struggle) => ({
  ...struggle,
  text: sourceMoveText(struggle.name, 4),
}));

type Struggle = (typeof STRUGGLES)[number];

/** A Struggle's id in the Libraries. */
export const struggleEntryId = (struggle: Struggle) => `struggle-${struggle.id}`;

/** The Struggle a Libraries entry is, if it is one. */
export const struggleOfEntry = (entryId: string) =>
  STRUGGLES.find((struggle) => struggleEntryId(struggle) === entryId);

/** The character data that makes a Struggle the revealed one, its track at its starting value. */
export const revealedStruggleData = (struggle: Struggle) => ({
  struggleRevealed: true,
  struggleId: struggle.id,
  struggleName: struggle.name,
  struggleTrack: struggle.track?.name ?? "",
  struggleProgress: struggle.track?.initial ?? 0,
  struggleMax: struggle.track?.max ?? 0,
});
