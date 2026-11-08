import type { GameSystem } from "./types";
import type { SystemExtension } from "./extensionTypes";
import { dnd55eExtension } from "./dnd55e/extension";
import { dungeonWorldExtension } from "./dungeon-world/extension";
import { dungeonWorld2Extension } from "./dungeon-world-2/extension";
import { bladesExtension } from "./blades-in-the-dark/extension";

/*
 * What a system adds to the table besides its rules: sheet components,
 * forms for its moves, and actions that change the campaign. The core asks
 * for these by hook and never by system id. Kept apart from the systems'
 * rules (./index.ts) so importing a system's rules does not pull in its UI.
 */

const EXTENSIONS: Record<string, SystemExtension> = {
  "dnd-5.5e": dnd55eExtension,
  "dungeon-world": dungeonWorldExtension,
  "dungeon-world-2": dungeonWorld2Extension,
  "blades-in-the-dark": bladesExtension,
};

const NONE: SystemExtension = {};

/** What a system adds to the table; nothing for systems that add nothing. */
export const extensionOf = (system: Pick<GameSystem, "id"> | string | undefined): SystemExtension =>
  EXTENSIONS[typeof system === "string" ? system : (system?.id ?? "")] ?? NONE;
