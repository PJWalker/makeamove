import { expect, test, type Page } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";
import { hexToOklch } from "../src/lib/colour";

/** Where on the screen the canvas's middle is, give or take an offset. */
async function canvasPoint(page: Page, dx = 0, dy = 0) {
  const canvas = page.locator(".scene-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("The scene canvas has no bounding box.");
  return { x: bounds.x + bounds.width / 2 + dx, y: bounds.y + bounds.height / 2 + dy };
}

const canvasCursor = (page: Page) =>
  (page.locator(".scene-canvas").element() as HTMLElement).style.cursor;

test("tool settings stay visible and usable in both toolbar layouts", async ({ page }) => {
  await createCampaign(page, "Integrated toolbar test");
  const toolbar = page.locator(".toolbar");
  const select = page.getByRole("button", { name: "Select (V)" });
  for (const width of [1920, 1280, 800, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await select.click();
    await settled(page);
    const before = await select.boundingBox();
    const initialHeight = toolbar.element().getBoundingClientRect().height;
    const strip = toolbar.locator(".toolbar-tools").element();
    const initialScroll = strip.scrollLeft;
    const initialLayout = await toolbar.getAttribute("data-full-width");
    const tokens = toolbar.getByRole("button", { name: "Tokens", exact: true });
    await expect(tokens).toBeVisible();
    const pressed = await tokens.getAttribute("aria-pressed");
    await tokens.press("Enter");
    await expect(tokens).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");
    await tokens.press("Enter");

    for (const tool of ["Draw (P)", "Shapes (R)", "Lights (L)", "Effects (F)"]) {
      await page.getByRole("button", { name: tool }).click();
      await settled(page);
      await expect(toolbar.locator(".tool-settings")).toBeVisible();
      const after = await select.boundingBox();
      if ((await toolbar.getAttribute("data-full-width")) === initialLayout)
        expect(after!.x + strip.scrollLeft).toBe(before!.x + initialScroll);
      expect(after?.y).toBe(before?.y);
      const bounds = await toolbar.boundingBox();
      expect(bounds!.height).toBe(initialHeight);
      if ((await toolbar.getAttribute("data-full-width")) === "true") {
        expect(bounds!.x).toBe(0);
        expect(bounds!.width).toBe(width);
        for (const sidebar of page.locator(".table").element().querySelectorAll(".sidebar"))
          expect(sidebar.getBoundingClientRect().top).toBe(bounds!.y + bounds!.height);
      }
      for (const element of toolbar
        .locator(".tool-settings")
        .element()
        .querySelectorAll('button, input:not([type="radio"]), .segment')) {
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        const rect = element.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(bounds!.x);
        expect(rect.right).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        expect(rect.top).toBeGreaterThanOrEqual(bounds!.y);
        expect(rect.bottom).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      }
      if (tool === "Draw (P)") {
        await expect(toolbar.getByRole("slider", { name: "Pen width" })).toBeVisible();
        await expect(toolbar.getByRole("radiogroup", { name: "Layer" })).toBeVisible();
        const at = await canvasPoint(page);
        await page.mouse.click(at.x, at.y);
        await expect(toolbar.getByRole("slider", { name: "Pen width" })).toBeVisible();
      }
    }
    for (const button of toolbar.element().querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      await toolbar
        .getByRole("button", { name: button.getAttribute("aria-label")!, exact: true })
        .click();
      await settled(page);
      expect(toolbar.element().getBoundingClientRect().height).toBe(initialHeight);
      await expect(toolbar).toHaveAttribute("data-full-width", initialLayout!);
    }
  }
}, 90_000);

test("scene-tinted surfaces follow scene chroma and lightness", async ({ page }) => {
  await createCampaign(page, "Scene-tinted sidebar test");
  const pixels = await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("transition", "none", "important");
    const probe = document.createElement("div");
    document.body.append(probe);
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas color sampling is unavailable.");

    const sample = (background: string) => {
      probe.style.backgroundColor = background;
      return ["oklch(40% 0.02 130)", "oklch(40% 0.2 130)", "oklch(90% 0.2 130)"].map(
        (sceneColour) => {
          root.style.setProperty("--scene-oklch", sceneColour);
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = getComputedStyle(probe).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data];
        },
      );
    };
    const samples = {
      toolbar: sample("var(--toolbar)"),
      surface: sample("var(--surface)"),
    };
    probe.remove();
    return samples;
  });

  const colours = (samples: number[][]) =>
    samples.map((pixel) => {
      expect(pixel[3]).toBeGreaterThan(150);
      const hex = `#${pixel
        .slice(0, 3)
        .map((channel) => channel!.toString(16).padStart(2, "0"))
        .join("")}`;
      return hexToOklch(hex);
    });
  const toolbarColours = colours(pixels.toolbar);
  const surfaceColours = colours(pixels.surface);
  expect(toolbarColours[0]!.c).toBeLessThanOrEqual(0.025);
  expect(toolbarColours[1]!.c).toBeLessThanOrEqual(0.075);
  expect(toolbarColours[1]!.c).toBeGreaterThan(0.055);
  expect(surfaceColours[0]!.c).toBeLessThanOrEqual(0.025);
  expect(surfaceColours[1]!.c).toBeGreaterThan(0.022);
  expect(surfaceColours[1]!.c).toBeLessThanOrEqual(0.03);
  expect(surfaceColours[2]!.l).toBeGreaterThan(surfaceColours[1]!.l + 0.01);
}, 30_000);

test("the toolbar reserves panel bodies but not sidebar tab rails", async ({ page }) => {
  await createCampaign(page, "Toolbar insets test");
  await page.setViewportSize({ width: 1920, height: 800 });
  await settled(page);
  const toolbar = page.locator(".toolbar");
  await expect(toolbar).toHaveAttribute("data-full-width", "false");
  const left = page.locator('.sidebar[data-side="left"] .sidebar-body').element();
  const right = page.locator('.sidebar[data-side="right"] .sidebar-body').element();
  await expect
    .poll(() => toolbar.element().getBoundingClientRect().left)
    .toBe(left.getBoundingClientRect().right);
  await expect
    .poll(() => toolbar.element().getBoundingClientRect().right)
    .toBe(right.getBoundingClientRect().left);

  await page.getByRole("tab", { name: "Characters", exact: true }).click();
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await settled(page);
  await expect(toolbar).toHaveAttribute("data-full-width", "false");
  await expect.poll(() => toolbar.element().getBoundingClientRect().left).toBe(0);
  await expect.poll(() => toolbar.element().getBoundingClientRect().width).toBe(1920);
});

test("the hotbar shares edge-bar sizing and clears the sidebars when expanded", async ({
  page,
}) => {
  await createCampaign(page, "Hotbar layout test");
  await page.setViewportSize({ width: 1920, height: 800 });
  await settled(page);
  const hotbar = page.getByRole("toolbar", { name: "Hotbar" });
  await expect(hotbar).toHaveAttribute("data-full-width", "false");
  const left = page.locator('.sidebar[data-side="left"] .sidebar-body').element();
  const right = page.locator('.sidebar[data-side="right"] .sidebar-body').element();
  const centre = () => {
    const rect = hotbar.element().getBoundingClientRect();
    return rect.left + rect.width / 2;
  };
  await expect
    .poll(centre)
    .toBe((left.getBoundingClientRect().right + right.getBoundingClientRect().left) / 2);

  await page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" }).click();
  const search = page.getByRole("combobox", { name: "Search actions" });
  await search.fill("Draw");
  await search.press("Alt+Enter");
  await search.press("Escape");
  await settled(page);
  await expect(hotbar.locator(".hotbar-slot")).toHaveCount(3);

  await page.setViewportSize({ width: 390, height: 800 });
  await settled(page);
  await expect(hotbar).toHaveAttribute("data-full-width", "true");
  await expect.poll(() => hotbar.element().getBoundingClientRect().left).toBe(0);
  const bounds = hotbar.element().getBoundingClientRect();
  expect(bounds.width).toBe(390);
  for (const sidebar of page.locator(".table").element().querySelectorAll(".sidebar"))
    expect(sidebar.getBoundingClientRect().bottom).toBe(bounds.top);
  await expect(
    hotbar.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" }),
  ).toBeInViewport();

  await page.getByRole("tab", { name: "Chat", exact: true }).press("Enter");
  await settled(page);
  await page.getByRole("tab", { name: "Characters", exact: true }).press("Enter");
  await settled(page);
  await expect(hotbar).toHaveAttribute("data-full-width", "false");
  await expect.poll(centre).toBe(195);
  for (const sidebar of page.locator(".table").element().querySelectorAll(".sidebar"))
    expect(sidebar.getBoundingClientRect().bottom).toBe(800);
}, 30_000);

test("sidebar tab rails clear the edge bars and scroll in short windows", async ({ page }) => {
  await createCampaign(page, "Scrollable sidebar rails");
  for (const width of [1920, 390]) {
    await page.setViewportSize({ width, height: 240 });
    await settled(page);
    const toolbar = page.locator(".toolbar").element().getBoundingClientRect();
    const hotbar = page.getByRole("toolbar", { name: "Hotbar" }).element().getBoundingClientRect();
    for (const rail of page
      .locator(".table")
      .element()
      .querySelectorAll<HTMLElement>(".sidebar-rail")) {
      const bounds = rail.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(toolbar.bottom);
      expect(bounds.bottom).toBeLessThanOrEqual(hotbar.top);
      expect(getComputedStyle(rail).overflowX).toBe("hidden");
      if (rail.scrollHeight > rail.clientHeight) {
        expect(getComputedStyle(rail).overflowY).toBe("auto");
        rail.scrollTop = rail.scrollHeight;
        expect(rail.scrollTop).toBeGreaterThan(0);
        const last = rail.lastElementChild!.getBoundingClientRect();
        expect(last.bottom).toBeLessThanOrEqual(bounds.bottom);
      }
    }
  }
}, 30_000);

/** Place text on the map with the Text tool, at a point on the canvas. */
async function placeText(page: Page, at: { x: number; y: number }, text: string) {
  await page.getByRole("button", { name: "Text (X)" }).click();
  await page.mouse.click(at.x, at.y);
  const box = page.getByRole("textbox", { name: "Text", exact: true });
  await expect(box).toBeVisible();
  await box.fill(text);
  await box.press("Enter");
  await expect(box).toHaveCount(0);
}

test("the canvas takes clicks once a campaign opens", async ({ page }) => {
  await createCampaign(page, "Canvas clicks test");
  await page.getByRole("button", { name: "Text (X)" }).click();
  const at = await canvasPoint(page);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toBeVisible();
});

test("the canvas still takes clicks after the campaign is left and reopened", async ({ page }) => {
  await createCampaign(page, "Canvas reopen test");
  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to Campaigns" }).click();
  await page
    .getByRole("button", { name: /^Canvas reopen test/ })
    .last()
    .click();
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
  await page.getByRole("button", { name: "Text (X)" }).click();
  const at = await canvasPoint(page);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole("textbox", { name: "Text", exact: true })).toBeVisible();
});

test("text on the map can be hovered, dragged and double-clicked", async ({ page }) => {
  await createCampaign(page, "Canvas gestures test");
  await settled(page);
  const at = await canvasPoint(page, -100, -60);
  await placeText(page, at, "Ford the river here");
  await page.getByRole("button", { name: "Select (V)" }).click();

  // Hovering over the text offers to move it.
  const over = { x: at.x + 120, y: at.y + 20 };
  await page.mouse.move(over.x, over.y);
  await expect.poll(() => canvasCursor(page)).toBe("move");

  // Dragging it somewhere else moves it there.
  await page.mouse.down();
  await page.mouse.move(over.x + 160, over.y + 120, { steps: 10 });
  await page.mouse.up();

  // Double-clicking it where it went opens it for editing.
  await page.mouse.dblclick(over.x + 160, over.y + 120);
  const box = page.getByRole("textbox", { name: "Text", exact: true });
  await expect(box).toBeVisible();
  await expect(box).toHaveValue("Ford the river here");

  // Nothing is left where it was.
  await page.mouse.move(over.x, over.y);
  await expect.poll(() => canvasCursor(page)).not.toBe("move");
});
