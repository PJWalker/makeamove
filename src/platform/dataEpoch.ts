export const DATA_EPOCH = 3;

export const dataName = (kind: string, id?: string) =>
  `mam:v${DATA_EPOCH}:${kind}${id === undefined ? "" : `:${id}`}`;
