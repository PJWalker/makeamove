export type EffectOp = "add" | "set" | "multiply" | "min" | "max";

/** Shared by items, conditions and features (design: "Effect model"). */
export type Effect =
  | { type: "modify"; path: string; op: EffectOp; value: number; priority?: number }
  | { type: "grantMove"; move: string }
  | { type: "grantTag"; tag: string }
  | { type: "rollBonus"; stat?: string; moves?: string[]; value: number };

export type EffectActive = "always" | "carried" | "equipped";
