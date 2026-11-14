import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite-plus";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "src/table/dice-fallbacks");
const server = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: ["three", "cannon-es"] },
  server: { host: "127.0.0.1", port: 0 },
});

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Could not find Vite's local port");

  const browser = await chromium.launch({
    args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 3,
    });
    await page.goto(`http://127.0.0.1:${address.port}/src/table/diceRenderer.ts`, {
      waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({
      type: "module",
      content: `
        globalThis.__diceFallbacksStatus = "loading";
        void (async () => {
          try {
            const { createDiceRenderer } = await import("/src/table/diceRenderer.ts");
            const renderer = createDiceRenderer();
            globalThis.__diceFallbacks = [4, 6, 8, 10, 12, 20].map((sides) => ({
              sides,
              dataUrl: renderer.renderBlank(sides),
            }));
            globalThis.__diceFallbacksStatus = "done";
          } catch (error) {
            globalThis.__diceFallbacksStatus = String(error);
          }
        })();
      `,
    });
    await page.waitForFunction(
      () => Reflect.get(globalThis, "__diceFallbacksStatus") !== "loading",
      undefined,
      { timeout: 30_000 },
    );
    const status = await page.evaluate(() => Reflect.get(globalThis, "__diceFallbacksStatus"));
    if (status !== "done") throw new Error(`The browser could not render die fallbacks: ${status}`);
    const renders = await page.evaluate(
      () =>
        Reflect.get(globalThis, "__diceFallbacks") as
          | { sides: number; dataUrl: string }[]
          | undefined,
    );
    if (!renders) throw new Error("The browser did not render any die fallbacks");

    await mkdir(output, { recursive: true });
    for (const { sides, dataUrl } of renders) {
      const base64 = dataUrl.match(/^data:image\/webp;base64,(.+)$/)?.[1];
      if (!base64) throw new Error(`d${sides} was not rendered as WebP`);
      const image = Buffer.from(base64, "base64");
      if (image.toString("ascii", 8, 12) !== "WEBP")
        throw new Error(`d${sides} has an invalid WebP payload`);
      await writeFile(resolve(output, `d${sides}.webp`), image);
      console.log(`Generated d${sides}.webp`);
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
