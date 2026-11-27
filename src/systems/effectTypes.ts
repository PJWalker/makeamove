export type EffectOp = "add" | "max" | "min" | "multiply" | "set";

/** Shared by items, conditions and features (design: "Effect model"). */
export type Effect =
  | { type: "grantMove"; move: string }
  | { type: "grantTag"; tag: string }
  | { type: "modify"; path: string; op: EffectOp; value: number; priority?: number }
  | { type: "rollBonus"; stat?: string; moves?: string[]; value: number };

export type EffectActive = "always" | "carried" | "equipped";
