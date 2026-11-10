import { readFileSync } from "node:fs";

/** A rulebook from reference/ (not committed), read when the rules data is generated. */
export const readReference = (path: string) =>
  readFileSync(new URL(`../../reference/${path}`, import.meta.url), "utf8");
