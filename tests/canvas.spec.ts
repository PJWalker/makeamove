import { expect, test, type Page } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

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
