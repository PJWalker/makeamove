export const DATA_EPOCH = 2;

export const dataName = (kind: string, id?: string) =>
  `mam:v${DATA_EPOCH}:${kind}${id === undefined ? "" : `:${id}`}`;
