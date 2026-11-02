import source from "../../../reference/Blades-in-the-Dark-SRD.md?raw";

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function abilities(title: string) {
  const start = source.indexOf(title);
  if (start < 0) return [];
  const section = source
    .slice(start + title.length)
    .split(/^#{1,2} /m)[0] ?? "";
  const headings = [...section.matchAll(/^### (.+)$/gm)];
  return headings.flatMap((heading, index) => {
    const name = heading[1]?.trim();
    if (!name || heading.index === undefined) return [];
    const next = headings[index + 1];
    return [{
      id: slug(name),
      name,
      text: section
        .slice(heading.index + (heading[0]?.length ?? 0), next?.index ?? section.length)
        .trim(),
    }];
  });
}

const PC_ABILITIES = abilities("## Special abilities");
export const CREW_ABILITIES = abilities("## Crew special abilities");
export const abilityRules = (name: string) =>
  PC_ABILITIES.find((ability) => key(ability.name) === key(name))?.text;
