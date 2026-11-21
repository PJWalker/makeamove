import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { decodeDataUrl, renderInBrowser } from "./renderInBrowser.ts";

const output = resolve(import.meta.dirname, "../src/ui/icon-art");
const only = process.argv.slice(2);

const renders = await renderInBrowser<{ name: string; size: number; dataUrl: string }[]>({
  module: "/scripts/icons/studio.ts",
  expression: `mod.renderIcons(${only.length > 0 ? JSON.stringify(only) : ""})`,
  dependencies: ["three"],
});

await mkdir(output, { recursive: true });
for (const { name, size, dataUrl } of renders) {
  await writeFile(resolve(output, `${name}-${size}.png`), decodeDataUrl(dataUrl, "png"));
  console.log(`Generated ${name}-${size}.png`);
}
