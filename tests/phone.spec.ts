import { expect, test, type Page } from "./browser-test";
import { createCampaign, drag, settled } from "./e2e-helpers";

const PHONE = { width: 375, height: 812 };

async function onPhone(page: Page, name: string, size = PHONE) {
  await page.setViewportSize(size);
  await createCampaign(page, name);
}

const bounds = (page: Page, selector: string) =>
  page.evaluate(() => document.querySelector(selector)!.getBoundingClientRect());

test("on a phone, a floating window fills the screen below the toolbar and stays put", async ({
  page,
}) => {
  await onPhone(page, "Phone windows");
  const notesTab = page.getByRole("tab", { name: "Notes" });
  await notesTab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a Window" }).click();
  const notesWindow = page.getByRole("region", { name: "Notes" });
  await expect(notesWindow).toBeVisible();
  await settled(page);

  const toolbar = await bounds(page, ".toolbar");
  const box = (await notesWindow.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(PHONE.width);
  expect(box.y).toBeCloseTo(toolbar.bottom, 0);
  expect(box.y + box.height).toBeCloseTo(PHONE.height, 0);

  // Its title bar doesn't carry it about.
  await drag(page, notesWindow.getByRole("heading", { name: "Notes" }), 200, 600);
  await settled(page);
  expect(await notesWindow.boundingBox()).toEqual(box);
  await expect(notesWindow.locator(".win-resize").first()).toBeHidden();
});

test("on a phone, an open sidebar covers the screen beside its tab strip", async ({ page }) => {
  await onPhone(page, "Phone sidebars", { width: 430, height: 932 });
  const sidebar = page.getByRole("complementary", { name: "Right sidebar" });
  await page.getByRole("tab", { name: /^Chat/ }).click();
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await settled(page);

  const strip = await bounds(page, '.sidebar[data-side="right"] .sidebar-rail-edge');
  const body = (await sidebar.getByRole("tabpanel").boundingBox())!;
  expect(strip.left).toBeCloseTo(0, 0);
  expect(body.x + body.width).toBeCloseTo(430, 0);
  await expect(sidebar.getByRole("separator", { name: "Resize right sidebar" })).toBeHidden();
});

test("on a phone, the canvas tools fit one row, with options only for tools that have them", async ({
  page,
}) => {
  await onPhone(page, "Phone toolbar");
  const tools = page.getByRole("navigation", { name: "Canvas tools" });
  const fits = () => tools.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(await fits()).toBe(true);
  const options = page.locator(".toolbar-options");

  await page.getByRole("button", { name: "Pan (H)" }).click();
  await expect(options).toBeHidden();
  const oneRow = await bounds(page, ".toolbar");
  const toolsRow = (await tools.boundingBox())!;
  expect(oneRow.height).toBeCloseTo(toolsRow.height, 0);

  await page.getByRole("button", { name: "Select (V)" }).click();
  await expect(options).toBeVisible();
});
