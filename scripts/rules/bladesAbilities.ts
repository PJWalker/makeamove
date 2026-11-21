import type { RichText } from "../../src/data/richText";
import { markdownToRichText } from "../../src/macros/markdown.macro";
import { readReference } from "./readReference";
import { slug } from "./slug";

const source = readReference("Blades-in-the-Dark-SRD.md");

function abilities(title: string): { id: string; name: string; text: RichText }[] {
  const start = source.indexOf(title);
  if (start === -1) return [];
  const section = source.slice(start + title.length).split(/^#{1,2} /m)[0] ?? "";
  const headings = [...section.matchAll(/^### (.+)$/gm)];
  return headings.flatMap((heading, index) => {
    const name = heading[1]?.trim();
    if (!name || heading.index === undefined) return [];
    const next = headings[index + 1];
    return [
      {
        id: slug(name),
        name,
        text: markdownToRichText(
          section
            .slice(heading.index + (heading[0]?.length ?? 0), next?.index ?? section.length)
            .trim(),
        ),
      },
    ];
  });
}

/** The SRD's special abilities, playbook and crew, parsed from the rulebook. */
export const bladesAbilities = () => ({
  pc: abilities("## Special abilities"),
  crew: abilities("## Crew special abilities"),
});
