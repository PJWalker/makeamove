

export const CONDITION_PIP_COLOURS = [
  "#e0614f",
  "#e3a23b",
  "#d9d24a",
  "#6cc070",
  "#4fb3c9",
  "#6d8fe8",
  "#a879e0",
  "#d46fb0",
];

export function conditionPipColour(index: number): string {
  return (CONDITION_PIP_COLOURS)[Math.max(0, index) % CONDITION_PIP_COLOURS.length]!;
}
