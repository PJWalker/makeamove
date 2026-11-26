import type { ItemDef } from "../../src/systems/types";
import readReference from "./readReference";
import slug from "./slug";

/** Parse the SRD's Magic Items A-Z section into searchable system gear. */
export function parseSrdMagicItems(markdown: string): ItemDef[] {
  const section = markdown.slice(markdown.indexOf("## Magic Items A–Z"));
  return section
    .split(/^#{4} /m)
    .slice(1)
    .flatMap((block): ItemDef[] => {
      const [heading, ...lines] = block.split(/\r?\n/);
      const name = heading?.trim();
      if (!name) return [];
      const metadata = lines.find((line) => /^_[^_]+_$/.test(line.trim()))?.trim() ?? "";
      const rarity =
        /\b(common|uncommon|rare|very rare|legendary|artifact)\b/i
          .exec(metadata)?.[1]
          ?.toLowerCase()
          .replaceAll(/\s+/g, "-") ?? "varies";
      const category =
        /^(weapon|armor|potion|ring|rod|scroll|staff|wand|wondrous item)/i
          .exec(metadata)?.[1]
          ?.toLowerCase()
          .replaceAll(/\s+/g, "-") ?? "magic";
      const description = lines
        .filter((line) => line.trim() !== metadata)
        .join("\n")
        .replaceAll(/<[^>]+>/g, " ")
        .trim();
      return [
        {
          id: `magic-${slug(name)}`,
          name,
          description: `${metadata.replaceAll(/^_|_$/g, "")}${description ? `\n${description}` : ""}`,
          weight: 0,
          tags: ["magic", rarity, category],
        },
      ];
    });
}

/** The SRD's magic items, read from reference/dnd-5.5e-srd/magic-items.md. */
export const srdMagicItems = () => parseSrdMagicItems(readReference("dnd-5.5e-srd/magic-items.md"));
