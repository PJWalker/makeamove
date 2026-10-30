import { dominantColour } from "../lib/colour";
import {
  MAX_IMAGE_SIZE,
  type ImageWorkerRequest,
  type ImageWorkerResponse,
  type ImageWorkerResult,
} from "./imageWorkerProtocol";

type WorkerScope = {
  onmessage: ((event: MessageEvent<ImageWorkerRequest>) => void) | null;
  postMessage(message: ImageWorkerResponse, transfer?: Transferable[]): void;
};

const scope = globalThis as unknown as WorkerScope;

async function sampleColour(bitmap: ImageBitmap): Promise<string> {
  const canvas = new OffscreenCanvas(64, 64);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create image sampling canvas");
  context.drawImage(bitmap, 0, 0, 64, 64);
  return dominantColour(context.getImageData(0, 0, 64, 64).data);
}

async function runTask(
  task: ImageWorkerRequest["task"],
): Promise<ImageWorkerResult> {
  if (task.type === "decode") {
    return { type: "decode", bitmap: await createImageBitmap(task.blob) };
  }

  const bitmap = await createImageBitmap(task.blob);
  try {
    if (task.type === "colour")
      return { type: "colour", colour: await sampleColour(bitmap) };

    const scale = Math.min(
      1,
      MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create image encoding canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    const [blob, colour] = await Promise.all([
      canvas.convertToBlob({ type: "image/webp", quality: 0.9 }),
      sampleColour(bitmap),
    ]);
    return { type: "import", blob, width, height, colour };
  } finally {
    bitmap.close();
  }
}

scope.onmessage = async ({ data }) => {
  try {
    const result = await runTask(data.task);
    scope.postMessage(
      { id: data.id, result },
      result.type === "decode" ? [result.bitmap] : [],
    );
  } catch (error) {
    scope.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
