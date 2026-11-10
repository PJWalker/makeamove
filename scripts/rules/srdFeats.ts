import { readReference } from "./readReference";
import type { OptionDef } from "../../src/systems/types";

export type SrdFeat = OptionDef & {
  category: "origin" | "general" | "fighting-style" | "epic";
};

/** Parse the local SRD's feat headings and category labels without duplicating its catalog in code. */
export function parseSrdFeats(markdown: string): SrdFeat[] {
  const sections = [
    ...markdown.matchAll(
      /^### (Origin|General|Fighting Style|Epic Boon) Feats\s*$([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm,
    ),
  ];
  const feats: SrdFeat[] = [];
  for (const section of sections) {
    const sectionTitle = section[1];
    const sectionBody = section[2];
    if (!sectionTitle || !sectionBody) continue;
    const category =
      sectionTitle === "Fighting Style"
        ? "fighting-style"
        : sectionTitle === "Epic Boon"
          ? "epic"
          : (sectionTitle.toLowerCase() as "origin" | "general");
    for (const block of sectionBody.split(/^#### /m).slice(1)) {
      const [heading, ...lines] = block.split(/\r?\n/);
      const name = heading?.trim();
      if (!name) continue;
      const text = lines
        .filter((line) => !/^_(?:Origin|General|Fighting Style|Epic Boon) Feat/.test(line.trim()))
        .join("\n")
        .trim();
      feats.push({
        id: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
        name,
        category,
        text,
      });
    }
  }
  return feats;
}

/** The SRD's feats, read from reference/dnd-5.5e-srd/feats.md. */
export const srdFeats = () => parseSrdFeats(readReference("dnd-5.5e-srd/feats.md"));
