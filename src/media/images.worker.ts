import { dominantColour } from "../lib/colour";
import { serveWorker } from "../lib/workerRpc";
import {
  MAX_IMAGE_SIZE,
  type ImageWorkerResult,
  type ImageWorkerTask,
} from "./imageWorkerProtocol";

function sampleColour(bitmap: ImageBitmap): string {
  const canvas = new OffscreenCanvas(64, 64);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create image sampling canvas");
  context.drawImage(bitmap, 0, 0, 64, 64);
  return dominantColour(context.getImageData(0, 0, 64, 64).data);
}

async function runTask(task: ImageWorkerTask): Promise<ImageWorkerResult> {
  if (task.type === "decode") {
    return { type: "decode", bitmap: await createImageBitmap(task.blob) };
  }

  const bitmap = await createImageBitmap(task.blob);
  try {
    if (task.type === "colour") return { type: "colour", colour: sampleColour(bitmap) };

    const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create image encoding canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    const colour = sampleColour(bitmap);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
    return { type: "import", blob, width, height, colour };
  } finally {
    bitmap.close();
  }
}

serveWorker<ImageWorkerTask, ImageWorkerResult>(runTask, (result) =>
  result.type === "decode" ? [result.bitmap] : [],
);
