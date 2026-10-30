export const MAX_IMAGE_SIZE = 8192;

export type ImageWorkerTask =
  | { type: "import"; blob: Blob }
  | { type: "decode"; blob: Blob }
  | { type: "colour"; blob: Blob };

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

export type ImageWorkerRequest = { id: number; task: ImageWorkerTask };
export type ImageWorkerResponse =
  | { id: number; result: ImageWorkerResult }
  | { id: number; error: string };
