export const parseCommaList = (value: string): string[] => value.split(",");

export const formatCommaList = (values: readonly string[]): string =>
  values.join(",");
