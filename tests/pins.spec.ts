import { expect, test } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

test("a pin on the map links to a page and opens it when clicked", async ({ page }) => {
  await createCampaign(page, "Pins test");
  const canvas = page.locator(".scene-canvas");
  const b = (await canvas.boundingBox())!;
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

  // The Pins tool asks what a new pin leads to: here, a page of its own.
  await page.getByRole("button", { name: "Pins (N)" }).click();
  await page.mouse.click(at.x, at.y);
  await page
    .getByRole("dialog", { name: "Pin To" })
    .getByRole("option", { name: "New Page" })
    .click();
  await page.getByRole("textbox", { name: "Title" }).fill("The Drowned Shrine");
  await page.getByRole("button", { name: "Back to the notes" }).click();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);

  // With the Select tool, the selection bar names it, and clicking the pin opens its page.
  await settled(page);
  await page.getByRole("button", { name: "Select (V)" }).click();
  await expect(
    page
      .getByRole("toolbar", { name: "Selection" })
      .getByRole("button", { name: "Pin To: The Drowned Shrine" }),
  ).toBeVisible();
  await page.mouse.click(at.x, at.y - 10);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("The Drowned Shrine");
});
