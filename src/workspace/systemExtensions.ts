import { createContext, useContext } from "react";
import type { SystemExtension } from "../systems/extensionTypes";
import type { GameSystem } from "../systems/types";

type ExtensionLookup = (system: Pick<GameSystem, "id"> | string | undefined) => SystemExtension;

/*
 * What each system adds to the table, provided by the table that mounts the
 * workspace. Workspace parts ask for it here instead of importing the
 * registry, which imports every system's UI, and so the parts those systems use.
 */
export const SystemExtensions = createContext<ExtensionLookup>(() => ({}));

/** What a system adds to the table; nothing outside a table that provides extensions. */
export const useExtension = (
  system: Pick<GameSystem, "id"> | string | undefined,
): SystemExtension => useContext(SystemExtensions)(system);
