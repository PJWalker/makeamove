import { joinCommas, splitCommas } from "./commaList";
import { isString } from "./guards";

export const parseCommaList = (value: string): string[] => splitCommas(value);

export const formatCommaList = (values: readonly string[]): string => joinCommas([...values]);

/** The entries of a stored comma list (a character or campaign field), without blanks. */
export const commaListOf = (value: unknown): string[] =>
  isString(value) || typeof value === "number" ? parseCommaList(String(value)).filter(Boolean) : [];
