import { readFileSync } from "node:fs";

/** A rulebook from reference/ (not committed), read when the rules data is generated. */
const readReference = (path: string) =>
  readFileSync(new URL(`../../reference/${path}`, import.meta.url), "utf8");

export default readReference;
