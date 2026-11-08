import { expect, test } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

test("hovering a labelled button shows its tooltip and keeps it up", async ({ page }) => {
  await createCampaign(page, "Tooltips");
  await settled(page);
  await page.getByRole("button", { name: "Campaign menu" }).hover();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText("Campaign menu");
  // It stays while the pointer rests on the button, rather than flashing away.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await expect(tooltip).toBeVisible();
});

test("a tooltip opens beside its button and points at it", async ({ page }) => {
  await createCampaign(page, "Tooltip placement");
  await page.getByRole("tab", { name: "Notes" }).hover();

  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("Notes");
  const tab = (await page.getByRole("tab", { name: "Notes" }).boundingBox())!;
  const tip = (await tooltip.boundingBox())!;
  const dir = await tooltip.getAttribute("data-dir");
  expect(dir === "left" || dir === "right").toBe(true);
  const gap = dir === "left" ? tab.x - (tip.x + tip.width) : tip.x - (tab.x + tab.width);
  expect(gap).toBeCloseTo(10, 0);
  const arrow = await tooltip.evaluate((el) =>
    parseFloat((el as HTMLElement).style.getPropertyValue("--arrow")),
  );
  expect(tip.y + arrow).toBeCloseTo(tab.y + tab.height / 2, 0);
});
