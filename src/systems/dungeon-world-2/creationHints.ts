import type { CreationHints } from "../types";
import { sourceClassSectionText } from "./paths";

const CLASS_IDS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "paladin",
  "ranger",
  "rogue",
  "wizard",
] as const;

const IDENTITY_FIELDS: Record<string, string> = {
  Ancestry: "ancestry",
  Community: "community",
  Background: "background",
};

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** "Ancestry: I am a\ne.g. dwarf, elf, etc. Question?" paragraphs, keyed by identity field. */
function originHints(classId: string) {
  return Object.fromEntries(
    sourceClassSectionText(classId, "Origins")
      .split(/\n\s*\n/)
      .flatMap((paragraph) => {
        const match = /^(\w+):[^\n]*\n([\s\S]+)$/.exec(paragraph.trim());
        const field = match && IDENTITY_FIELDS[match[1]!];
        return field ? [[field, oneLine(match[2]!)]] : [];
      }),
  );
}

/** The class's relationship examples, without the sheet's blank relationship lines. */
function relationshipHint(classId: string) {
  const examples = sourceClassSectionText(classId, "Relationships").split(
    "#### Relationship Examples",
  )[1];
  if (!examples) return undefined;
  const items = examples
    .replace(/~~[^~]*~~\s*/g, "")
    .split("✦")
    .map(oneLine)
    .filter(Boolean);
  return `e.g. ${items.join(" ✦ ")}`;
}

/** The class's name examples and stat rule. */
function nameAndScoreHints(classId: string) {
  const [names = "", ...scores] = sourceClassSectionText(classId, "Name").split(/\n\s*\n/);
  return { name: oneLine(names), scores: oneLine(scores.join(" ")) };
}

export const CLASS_CREATION_HINTS: Record<string, CreationHints> = Object.fromEntries(
  CLASS_IDS.map((classId) => {
    const relationship = relationshipHint(classId);
    return [
      classId,
      {
        ...nameAndScoreHints(classId),
        identity: originHints(classId),
        ...(relationship ? { relationship } : {}),
      },
    ];
  }),
);
