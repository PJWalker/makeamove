import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bladesAbilities } from "./rules/bladesAbilities";
import {
  bondTexts,
  PATHS,
  sourceGmReference,
  sourceMagicItems,
  sourceMoves,
  struggleTexts,
} from "./rules/dungeonWorld2";
import { classCreationHints } from "./rules/dungeonWorld2Hints";
import { srdFeats } from "./rules/srdFeats";
import { srdMagicItems } from "./rules/srdMagicItems";
import { srdMonsters } from "./rules/srdMonsters";
import { srdSpells } from "./rules/srdSpells";

/*
 * Converts the rulebooks in reference/ into the JSON the app imports. Run it
 * with `npm run generate:rules` after changing a parser or a rulebook, and
 * commit the result: reference/ is not in the repository.
 */

const write = (path: string, data: unknown) => {
  const file = new URL(`../${path}`, import.meta.url);
  mkdirSync(dirname(file.pathname), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(data)}
`,
  );
};

write("src/systems/dnd55e/srd/feats.json", srdFeats());
write("src/systems/dnd55e/srd/magicItems.json", srdMagicItems());
write("src/systems/dnd55e/srd/monsters.json", srdMonsters());
write("src/systems/dnd55e/srd/spells.json", srdSpells());
write("src/systems/blades-in-the-dark/abilities.json", bladesAbilities());
write("src/systems/dungeon-world-2/rulebook.json", {
  paths: PATHS,
  bondTexts: bondTexts(),
  struggleTexts: struggleTexts(),
  magicItems: sourceMagicItems(),
  gmReference: sourceGmReference(),
  moves: sourceMoves(),
  creationHints: classCreationHints(),
});

// Loaded only now: the class parser reads the subclasses, which use the feats written above.
const { srdClassFeatures } = await import("./rules/srdClasses");
write("src/systems/dnd55e/srd/classFeatures.json", srdClassFeatures());
