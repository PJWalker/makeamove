import type { RichText } from "../../data/richText";
import abilities from "./abilities.json";

/** The SRD's special abilities, generated from the rulebook by `npm run generate:rules`. */
const { pc: PC_ABILITIES, crew } = abilities as unknown as Record<
  "crew" | "pc",
  { id: string; name: string; text: RichText }[]
>;

export const CREW_ABILITIES = crew;

const key = (value: string) => value.toLowerCase().replaceAll(/[^\da-z]/g, "");

/** A playbook ability's rules text from the SRD, by its name. */
export const abilityRules = (name: string) =>
  PC_ABILITIES.find((ability) => key(ability.name) === key(name))?.text;
