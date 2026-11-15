import { useCampaign } from "../../workspace/campaignContext";
import { startMove } from "../../workspace/commands/characters";
import type { SectionContext } from "../../workspace/sheetSections";

export const num = (v: unknown) => Number(v ?? 0);
export const valueOf = (values: Record<string, number>, key: string) => values[key] ?? 0;
export const RANK = ["Not proficient", "Proficient", "Expertise"];

/** A character's level, within the 1 to 20 the rules allow. */
export const levelOf = (data: Record<string, unknown>) =>
  Math.min(20, Math.max(1, num(data["level"]) || 1));

/** Make the action with this id as the character, when the system has one. */
export function useAction({ system, c }: Pick<SectionContext, "system" | "c">) {
  const ctx = useCampaign();
  return (id: string) => {
    const a = system.actions.find((x) => x.id === id);
    if (a) ctx.execute(startMove, { characterId: c.id, move: a.id });
  };
}
