import { readReference } from "./readReference";
import { slug } from "./slug";
import type { OptionDef } from "../../src/systems/types";

export type SrdFeat = OptionDef & {
  category: "origin" | "general" | "fighting-style" | "epic";
};

const CATEGORIES: Record<string, SrdFeat["category"]> = {
  Origin: "origin",
  General: "general",
  "Fighting Style": "fighting-style",
  "Epic Boon": "epic",
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
    const category = CATEGORIES[sectionTitle];
    if (!category) continue;
    for (const block of sectionBody.split(/^#### /m).slice(1)) {
      const [heading, ...lines] = block.split(/\r?\n/);
      const name = heading?.trim();
      if (!name) continue;
      const text = lines
        .filter((line) => !/^_(?:Origin|General|Fighting Style|Epic Boon) Feat/.test(line.trim()))
        .join("\n")
        .trim();
      feats.push({
        id: slug(name),
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
