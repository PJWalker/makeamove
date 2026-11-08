import { STRUGGLE_SPECS } from "./struggleSpecs";
import { struggleTexts } from "./paths.macro" with { type: "macro" };

const TEXTS = struggleTexts();

export const STRUGGLES = STRUGGLE_SPECS.map((struggle) => ({
  ...struggle,
  text: TEXTS[struggle.id] ?? "",
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
