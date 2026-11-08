export const MAX_IMAGE_SIZE = 8192;

export type ImageWorkerTask =
  { type: "import"; blob: Blob } | { type: "decode"; blob: Blob } | { type: "colour"; blob: Blob };

export type ImageWorkerResult =
  | {
      type: "import";
      blob: Blob;
      width: number;
      height: number;
      colour: string;
    }
  | { type: "decode"; bitmap: ImageBitmap }
  | { type: "colour"; colour: string };
