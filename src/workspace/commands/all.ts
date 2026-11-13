import { campaignCommands } from "./campaign";
import { characterCommands } from "./characters";
import { chatCommands } from "./chat";
import { combatCommands } from "./combat";
import { coreCommands } from "./core";
import { noteCommands } from "./notes";
import { sceneCommands } from "./scenes";
import { selectionCommands } from "./selection";
import type { AnyTableCommand } from "./types";

/** Every command the table offers, in the order the palette lists them. */
export const tableCommands: readonly AnyTableCommand[] = [
  ...coreCommands,
  ...characterCommands,
  ...sceneCommands,
  ...selectionCommands,
  ...noteCommands,
  ...combatCommands,
  ...chatCommands,
  ...campaignCommands,
];
