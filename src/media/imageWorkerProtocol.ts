import type { ImageGrid } from "./gridDetect";

export const MAX_IMAGE_SIZE = 8192;

export type ImageWorkerTask =
  | { type: "colour"; blob: Blob }
  | { type: "decode"; blob: Blob }
  | { type: "import"; blob: Blob }
  | { type: "squareGrid"; blob: Blob };

export type ImageWorkerResult =
  | {
      type: "import";
      blob: Blob;
      width: number;
      height: number;
      colour: string;
    }
  | { type: "colour"; colour: string }
  | { type: "decode"; bitmap: ImageBitmap }
  | { type: "squareGrid"; grid: ImageGrid | null };
