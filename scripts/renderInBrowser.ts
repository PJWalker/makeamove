import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite-plus";

const root = resolve(import.meta.dirname, "..");

/**
 * Loads one of the project's modules in headless Chromium (with software
 * WebGL) and returns what `expression` evaluates to. The expression sees the
 * loaded module as `mod` and may be async; its result must be JSON-safe.
 */
export async function renderInBrowser<T>({
  module,
  expression,
  dependencies,
  deviceScaleFactor = 1,
}: {
  /** Path from the project root, such as "/src/table/diceRenderer.ts". */
  module: string;
  expression: string;
  /** Packages the module imports, prebundled so the page loads quickly. */
  dependencies: string[];
  deviceScaleFactor?: number;
}): Promise<T> {
  const server = await createServer({
    configFile: false,
    root,
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: dependencies },
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string")
      throw new Error("Could not find Vite's local port");

    const browser = await chromium.launch({
      args: ["--enable-webgl", "--use-gl=angle", "--use-angle=swiftshader"],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 800, height: 600 },
        deviceScaleFactor,
      });
      await page.goto(`http://127.0.0.1:${address.port}${module}`, {
        waitUntil: "domcontentloaded",
      });
      return (await page.evaluate(
        `(async () => { const mod = await import(${JSON.stringify(module)}); return ${expression}; })()`,
      )) as T;
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

/** Decodes a canvas data URL, checking it holds the expected image format. */
export function decodeDataUrl(dataUrl: string, type: "png" | "webp"): Buffer {
  const base64 = dataUrl.match(new RegExp(`^data:image/${type};base64,(.+)$`))?.[1];
  if (!base64) throw new Error(`Expected a ${type} data URL`);
  return Buffer.from(base64, "base64");
}
