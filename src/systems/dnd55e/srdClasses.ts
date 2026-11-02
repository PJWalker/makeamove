import source from "../../../reference/dnd-5.5e-srd/classes.md?raw";
import type { Feature } from "./data";
import { SUBCLASSES } from "./origins";

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parseSrdClassFeatures(markdown: string): Feature[] {
  const features: Feature[] = [];
  for (const section of markdown.split(/^## /m).slice(1)) {
    const classHeading = section.split("\n")[0]?.trim();
    if (!classHeading) continue;
    const classId = slug(classHeading);
    const headings = [...section.matchAll(/^(#{3,6}) (.+)$/gm)];
    let subclassId: string | undefined;
    for (const [index, heading] of headings.entries()) {
      const depth = heading[1];
      const title = heading[2];
      if (!depth || !title) continue;
      if (depth === "###" && title.includes("Subclass:"))
        subclassId = SUBCLASSES.find(
          (subclass) =>
            subclass.requires.classId === classId &&
            title.endsWith(subclass.name),
        )?.id;
      const match =
        depth === "####" && /^Level (\d+): (.+)$/.exec(title);
      if (!match) continue;
      const [, levelText, featureName] = match;
      if (!levelText || !featureName) continue;
      const level = Number(levelText);
      const name = featureName.trim();
      const next = headings
        .slice(index + 1)
        .find((candidate) => (candidate[1]?.length ?? Infinity) <= 4);
      const text = section
        .slice(
          heading.index! + heading[0].length,
          next?.index ?? section.length,
        )
        .trim();
      features.push({
        id: `feature-${classId}-${level}-${slug(name)}`,
        name,
        classes: { [classId]: level },
        ...(subclassId ? { subclassId } : {}),
        trigger: `Level ${level} ${subclassId ? "subclass" : "class"} feature`,
        text,
      });
    }
  }
  return features;
}

export const SRD_CLASS_FEATURES = parseSrdClassFeatures(source);
