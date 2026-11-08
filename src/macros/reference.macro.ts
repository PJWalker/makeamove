import { readFileSync } from "node:fs";

/** A rulebook from reference/, read at build time by a rules macro. */
export const readReference = (path: string) =>
  readFileSync(new URL(`../../reference/${path}`, import.meta.url), "utf8");
