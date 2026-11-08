import { bladesAbilities } from "./content.macro" with { type: "macro" };

/** The SRD's special abilities, parsed from reference/Blades-in-the-Dark-SRD.md at build time. */
const { pc: PC_ABILITIES, crew } = bladesAbilities();

export const CREW_ABILITIES = crew;

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A playbook ability's rules text from the SRD, by its name. */
export const abilityRules = (name: string) =>
  PC_ABILITIES.find((ability) => key(ability.name) === key(name))?.text;
