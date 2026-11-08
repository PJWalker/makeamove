import type { CharacterView } from "../characters/types";
import type { Derived, GameSystem, ResourceStatus } from "../../systems/types";

export const PIP_COLOURS = {
  red: "#e0614f",
  orange: "#e3a23b",
  yellow: "#d9d24a",
  green: "#6cc070",
  teal: "#4fb3c9",
  blue: "#6d8fe8",
  purple: "#a879e0",
  pink: "#d46fb0",
};

/** Concentration's pip colour. */
export const CONCENTRATION_COLOUR = "#ffffff";

const CONDITION_PIP_COLOURS = Object.values(PIP_COLOURS);

export function conditionPipColour(index: number): string {
  return CONDITION_PIP_COLOURS[Math.max(0, index) % CONDITION_PIP_COLOURS.length]!;
}

/** A condition's pip colour: its own, or one by its place in the system's list. */
export function conditionColour(system: GameSystem, id: string): string {
  const index = system.conditions.findIndex((condition) => condition.id === id);
  return system.conditions[index]?.colour ?? conditionPipColour(index);
}

/** The resource statuses a character is in now: Bloodied while HP is at half or less. */
export function activeResourceStatuses(
  system: GameSystem,
  c: CharacterView,
  d: Derived,
): ResourceStatus[] {
  return system.resources.flatMap((resource) =>
    resource.status && (c.resources[resource.id] ?? 0) <= (d.values[resource.status.atOrBelow] ?? 0)
      ? [resource.status]
      : [],
  );
}
