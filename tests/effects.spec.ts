import { expect, test } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

test("the GM puts down an effect zone, then picks it and changes its effect", async ({ page }) => {
  await createCampaign(page, "Effects test");
  await settled(page);
  const canvas = page.locator(".scene-canvas");
  await expect(canvas).toBeVisible();
  const b = (await canvas.boundingBox())!;
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

  // A circle of rain, dragged out from its centre.
  await page.getByRole("button", { name: "Effects (F)" }).click();
  await page.getByRole("radio", { name: "Rain" }).click();
  await page.getByRole("radio", { name: "Circle" }).click();
  await settled(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 150, at.y, { steps: 10 });
  await page.mouse.up();

  // The Select tool picks it once Effects are on, and its effect can be changed.
  await page.getByRole("button", { name: "Select (V)" }).click();
  await page.getByRole("button", { name: "Effects", exact: true }).click();
  await page.mouse.click(at.x + 20, at.y + 10);
  const bar = page.getByRole("toolbar", { name: "Selection" });
  await expect(bar.getByRole("radio", { name: "Rain" })).toHaveAttribute("aria-checked", "true");
  await bar.getByRole("radio", { name: "Snow" }).click();
  await expect(bar.getByRole("radio", { name: "Snow" })).toHaveAttribute("aria-checked", "true");

  // Rain neither gives light nor blocks sight, until the GM says so.
  const blocks = bar.getByRole("button", { name: "Blocks Sight" });
  await expect(blocks).toHaveAttribute("aria-pressed", "false");
  await blocks.click();
  await expect(blocks).toHaveAttribute("aria-pressed", "true");
  await expect(bar.getByRole("button", { name: "Gives Light" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
