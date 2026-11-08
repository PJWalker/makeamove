import { readReference } from "../../macros/reference.macro";
import type { MonsterDef } from "../types";

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function valueAfter(section: string, label: string) {
  return new RegExp(`\\*\\*${label}\\*\\*\\s*([^<*\\n]+)`, "i").exec(section)?.[1]?.trim() ?? "";
}

function sectionText(block: string, name: string) {
  const headings = [...block.matchAll(/^#### (.+)$/gm)];
  const heading = headings.find((entry) => entry[1]?.trim().toLowerCase() === name.toLowerCase());
  if (!heading || heading.index === undefined) return "";
  const end = headings.find((entry) => (entry.index ?? -1) > heading.index)?.index ?? block.length;
  return block
    .slice(heading.index + (heading[0]?.length ?? 0), end)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Parse the public SRD monster A-Z document into createable NPC records. */
export function parseSrdMonsters(markdown: string): MonsterDef[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .flatMap((block): MonsterDef[] => {
      const name = block.split(/\r?\n/, 1)[0]?.trim();
      if (!name || name === "Monster A–Z") return [];
      const details = /^_([^_]+)_/m.exec(block)?.[1] ?? "";
      const size = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i
        .exec(details)?.[1]
        ?.toLowerCase();
      const scores = Object.fromEntries(
        [
          ...block.matchAll(
            /<strong>(STR|DEX|CON|INT|WIS|CHA)<\/strong>\s*<\/td>\s*<td>(\d+)<\/td>/gi,
          ),
        ].flatMap((match) => {
          const ability = match[1];
          const score = match[2];
          return ability && score ? [[ability.toLowerCase(), Number(score)]] : [];
        }),
      );
      const fields = {
        ac: Number(valueAfter(block, "AC")) || 10,
        speed: valueAfter(block, "Speed"),
        cr: valueAfter(block, "CR"),
        senses: valueAfter(block, "Senses"),
        languages: valueAfter(block, "Languages"),
        savingThrows: valueAfter(block, "Saving Throws"),
        skills: valueAfter(block, "Skills"),
        traits: sectionText(block, "Traits"),
        actions: sectionText(block, "Actions"),
        bonusActions: sectionText(block, "Bonus Actions"),
        reactions: sectionText(block, "Reactions"),
      };
      return [
        {
          id: slug(name),
          name,
          description: `${details}${fields.cr ? ` · CR ${fields.cr}` : ""}`,
          hp: Number(valueAfter(block, "HP").replace(/,/g, "").match(/^\d+/)?.[0]) || 1,
          scores,
          fields,
          ...(size ? { size } : {}),
        },
      ];
    });
}

/** The SRD's monsters, read from reference/dnd-5.5e-srd/monsters-A-Z.md. */
export const srdMonsters = () => parseSrdMonsters(readReference("dnd-5.5e-srd/monsters-A-Z.md"));
