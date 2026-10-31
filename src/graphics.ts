import type { BlobRef } from "./scene/types";

export type EntityGraphic =
  | { kind: "icon"; name: string }
  | { kind: "image"; image: BlobRef };

export interface EntityGraphicRef {
  kind: string;
  id: string;
}

export const entityGraphicKey = (kind: string, id: string) => `${kind}:${id}`;
