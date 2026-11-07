import source from "../../../reference/dnd-5.5e-srd/magic-items.md?raw";
import type { ItemDef } from "../types";

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Parse the SRD's Magic Items A-Z section into searchable system gear. */
export function parseSrdMagicItems(markdown: string): ItemDef[] {
  const section = markdown.slice(markdown.indexOf("## Magic Items A–Z"));
  return section
    .split(/^#### /m)
    .slice(1)
    .flatMap((block): ItemDef[] => {
      const [heading, ...lines] = block.split(/\r?\n/);
      const name = heading?.trim();
      if (!name) return [];
      const metadata = lines.find((line) => /^_[^_]+_$/.test(line.trim()))?.trim() ?? "";
      const rarity =
        /\b(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)\b/i
          .exec(metadata)?.[1]
          ?.toLowerCase()
          .replace(/\s+/g, "-") ?? "varies";
      const category =
        /^(Weapon|Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Wondrous Item)/i
          .exec(metadata)?.[1]
          ?.toLowerCase()
          .replace(/\s+/g, "-") ?? "magic";
      const description = lines
        .filter((line) => line.trim() !== metadata)
        .join("\n")
        .replace(/<[^>]+>/g, " ")
        .trim();
      return [
        {
          id: `magic-${slug(name)}`,
          name,
          description: `${metadata.replace(/^_|_$/g, "")}${description ? `\n${description}` : ""}`,
          weight: 0,
          tags: ["magic", rarity, category],
        },
      ];
    });
}

export const SRD_MAGIC_ITEMS = parseSrdMagicItems(source);
