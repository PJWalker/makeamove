import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decodeDataUrl, renderInBrowser } from "./renderInBrowser.ts";

const output = resolve(import.meta.dirname, "../src/table/dice-fallbacks");

const renders = await renderInBrowser<{ sides: number; dataUrl: string }[]>({
  module: "/src/table/diceRenderer.ts",
  expression: `(() => {
    const renderer = mod.createDiceRenderer();
    return [4, 6, 8, 10, 12, 20].map((sides) => ({ sides, dataUrl: renderer.renderBlank(sides) }));
  })()`,
  dependencies: ["three", "cannon-es"],
  deviceScaleFactor: 3,
});

await mkdir(output, { recursive: true });
for (const { sides, dataUrl } of renders) {
  const image = decodeDataUrl(dataUrl, "webp");
  if (image.toString("ascii", 8, 12) !== "WEBP")
    throw new Error(`d${sides} has an invalid WebP payload`);
  await writeFile(resolve(output, `d${sides}.webp`), image);
  console.log(`Generated d${sides}.webp`);
}
