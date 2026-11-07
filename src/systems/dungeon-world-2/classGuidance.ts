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

export const CLASS_CREATION_GUIDANCE = Object.fromEntries(
  CLASS_IDS.map((classId) => [
    classId,
    {
      origins: sourceClassSectionText(classId, "Origins"),
      relationships: sourceClassSectionText(classId, "Relationships"),
      equipment: sourceClassSectionText(classId, "Equipment & Appearance"),
      namesAndStats: sourceClassSectionText(classId, "Name"),
    },
  ]),
);

export function classCreationGuidance(classId: string) {
  return CLASS_CREATION_GUIDANCE[classId as keyof typeof CLASS_CREATION_GUIDANCE];
}
