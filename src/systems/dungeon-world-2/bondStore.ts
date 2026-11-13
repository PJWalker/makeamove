import type { Characters } from "../../campaign/schema";
import { pairKey, type SystemData } from "../../campaign/systemStore";
import { isObject } from "../../data/guards";
import { relationshipsOf, removeRelationship } from "../../features/characters/relationships";
import type { RelationshipDepthDef } from "../types";

/*
 * Bonds: once two PCs' relationships both reach full Depth, they forge a
 * shared Bond, kept in the campaign's system data by pair.
 */

export const DW2_RELATIONSHIP_DEPTH: RelationshipDepthDef = { label: "Depth", max: 3 };
const FULL = DW2_RELATIONSHIP_DEPTH.max;

export interface SharedBond {
  first: string;
  second: string;
  type: string;
  advancedMoves: string[];
}

const isBond = (v: unknown): v is SharedBond =>
  isObject<SharedBond>(v) && Array.isArray(v.advancedMoves);
const bondsOf = (systemData: SystemData) => systemData.store("bonds", isBond);

export function bondBetween(
  systemData: SystemData,
  first: string,
  second: string,
): SharedBond | undefined {
  const bond = bondsOf(systemData).get(pairKey(first, second));
  return bond ? { ...bond, advancedMoves: [...bond.advancedMoves] } : undefined;
}

export function bondsFor(systemData: SystemData, characterId: string): SharedBond[] {
  return bondsOf(systemData)
    .values()
    .filter((bond) => bond.first === characterId || bond.second === characterId)
    .map((bond) => ({ ...bond, advancedMoves: [...bond.advancedMoves] }));
}

/** Forge or reinforce the shared Bond after both PCs reach full Depth. */
export function forgeBond(
  systemData: SystemData,
  characters: Characters,
  first: string,
  second: string,
  type: string,
  /** Give a character XP: for each advanced move the old Bond loses. */
  awardXp: (characterId: string, xp: number) => void,
): boolean {
  if (first === second || !characters.has(first) || !characters.has(second)) return false;
  const firstDepth = relationshipsOf(characters, first).find((r) => r.to === second)?.depth ?? 0;
  const secondDepth = relationshipsOf(characters, second).find((r) => r.to === first)?.depth ?? 0;
  if (firstDepth < FULL || secondDepth < FULL) return false;

  const [pairFirst, pairSecond] = [first, second].sort();
  const existing = bondBetween(systemData, first, second);
  const bond: SharedBond = {
    first: pairFirst!,
    second: pairSecond!,
    type,
    advancedMoves: existing?.type === type ? existing.advancedMoves : [],
  };
  const bonds = bondsOf(systemData);
  characters.transact(() => {
    bonds.set(pairKey(first, second), bond);
    removeRelationship(characters, first, second);
    removeRelationship(characters, second, first);
    if (existing && existing.type !== type && existing.advancedMoves.length)
      for (const id of [first, second]) awardXp(id, existing.advancedMoves.length);
  });
  return true;
}

export function advanceBond(
  systemData: SystemData,
  characters: Characters,
  first: string,
  second: string,
  moveId: string,
): boolean {
  const bonds = bondsOf(systemData);
  const key = pairKey(first, second);
  const current = bonds.get(key);
  if (!current || current.advancedMoves.includes(moveId)) return false;
  const firstDepth = relationshipsOf(characters, first).find((r) => r.to === second)?.depth ?? 0;
  const secondDepth = relationshipsOf(characters, second).find((r) => r.to === first)?.depth ?? 0;
  if (firstDepth < FULL || secondDepth < FULL) return false;
  bonds.set(key, {
    ...current,
    advancedMoves: [...current.advancedMoves, moveId],
  });
  removeRelationship(characters, first, second);
  removeRelationship(characters, second, first);
  return true;
}
