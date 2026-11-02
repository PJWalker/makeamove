import source from "../../../reference/dnd-5.5e-srd/spells.md?raw";
import type { Ability, Spell } from "./data";
import { parseCommaList } from "../../lib/list";

const ABILITIES: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};
const DAMAGE =
  "Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder";
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Parse the SRD's consistently formatted spell entries into the system model. */
export function parseSrdSpells(markdown: string): Spell[] {
  const section = markdown.slice(markdown.indexOf("## Spell Descriptions"));
  return section
    .split(/^#### /m)
    .slice(1)
    .flatMap((block): Spell[] => {
      const [nameLine, ...lines] = block.split(/\r?\n/);
      const name = nameLine?.trim();
      const metadata =
        lines
          .find(
            (line) => line.trim().startsWith("_") && line.trim().endsWith("_"),
          )
          ?.trim() ?? "";
      const header =
        /^_(?:Level (\d+) [A-Za-z]+|[A-Za-z]+ Cantrip) \(([^)]+)\)_/.exec(
          metadata,
        );
      if (!name || !header) return [];
      const casterList = header[2];
      if (!casterList) return [];
      const level = Number(header[1] ?? 0);
      const classes = parseCommaList(casterList).map((value) =>
        slug(value.trim()),
      );
      const field = (label: string) =>
        lines
          .find((line) => line.startsWith(`**${label}:**`))
          ?.replace(`**${label}:**`, "")
          .trim() ?? "";
      const castingTime = field("Casting Time");
      const rangeText = field("Range");
      const duration = field("Duration");
      const body = lines
        .filter(
          (line) =>
            line.trim() !== metadata &&
            !/^\*\*(Casting Time|Range|Components|Duration):\*\*/.test(line),
        )
        .join("\n")
        .trim();
      const saveName = new RegExp(
        `\\b(${Object.keys(ABILITIES).join("|")}) saving throw`,
        "i",
      )
        .exec(body)?.[1]
        ?.toLowerCase();
      const damage = new RegExp(
        `(\\d+)d(\\d+)\\s*(${DAMAGE})?\\s*damage`,
        "i",
      ).exec(body);
      const healing =
        /regains? (?:a number of )?(?:Hit Points equal to )?(\d+)d(\d+)/i.exec(
          body,
        );
      const scaling =
        /(?:damage|healing) increases by (\d+)d\d+ for each (?:spell )?slot level/i.exec(
          body,
        );
      const damageModifier = /plus your spellcasting ability modifier/i.test(
        body,
      );
      const attack = /spell attack|attack roll/i.test(body) && !saveName;
      const shapeMatch =
        /(\d+)-foot(?:-radius)?\s+(Cube|Sphere|Cone|Line|Emanation)/i.exec(
          body,
        );
      const shape = shapeMatch?.[2]?.toLowerCase();
      const shapeSize = shapeMatch?.[1];
      const area =
        shape && shapeSize && ["cube", "sphere", "cone", "line", "emanation"].includes(shape)
          ? {
              shape: shape as "cube" | "sphere" | "cone" | "line" | "emanation",
              size: Number(shapeSize),
              ...(shape === "line" ? { width: 5 } : {}),
            }
          : undefined;
      const feet = /^(\d+) feet/i.exec(rangeText)?.[1];
      const target = feet
        ? {
            prompt: `Choose targets within ${feet} feet`,
            min: 1,
            range: { normal: Number(feet) },
          }
        : undefined;
      return [
        {
          id: slug(name),
          name,
          level,
          classes,
          trigger: [castingTime, rangeText, duration]
            .filter(Boolean)
            .join(" · "),
          text: body,
          ...(/ritual/i.test(castingTime) ? { ritual: true } : {}),
          ...(scaling ? { upcastDice: Number(scaling[1]) } : {}),
          ...(attack ? { attack: true } : {}),
          ...(damage
            ? {
                roll: {
                  label: "damage" as const,
                  ...(damage[3] ? { type: damage[3].toLowerCase() } : {}),
                  count: Number(damage[1]),
                  die: Number(damage[2]),
                  mod: damageModifier,
                },
              }
            : {}),
          ...(!damage && healing
            ? {
                roll: {
                  label: "healing" as const,
                  type: "healing",
                  count: Number(healing[1]),
                  die: Number(healing[2]),
                  mod: damageModifier,
                },
              }
            : {}),
          ...(saveName && ABILITIES[saveName]
            ? { save: ABILITIES[saveName] }
            : {}),
          ...(target
            ? { target: { ...target, ...(area ? { area } : {}) } }
            : area
              ? { area }
              : {}),
        },
      ];
    });
}

export const SRD_SPELLS = parseSrdSpells(source);
