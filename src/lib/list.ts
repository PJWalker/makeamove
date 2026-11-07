export const parseCommaList = (value: string): string[] => value.split(",");

export const formatCommaList = (values: readonly string[]): string => values.join(",");

/** The entries of a stored comma list (a character or campaign field), without blanks. */
export const commaListOf = (value: unknown): string[] =>
  parseCommaList(String(value ?? "")).filter(Boolean);
