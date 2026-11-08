import { classCreationHints } from "./creationHints.macro" with { type: "macro" };

/** Each class's creation hints, read from the rulebook at build time. */
export const CLASS_CREATION_HINTS = classCreationHints();
