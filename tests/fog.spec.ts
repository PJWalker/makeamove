import { expect, test } from "./browser-test";
import { createCampaign, settled } from "./e2e-helpers";

test("the GM turns on fog of war, and draws shapes that reveal or hide what's in them", async ({
  page,
}) => {
  await createCampaign(page, "Fog test");
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true") await scenesTab.click();

  // Off until the GM chooses how it's revealed.
  const settings = page.getByRole("region", { name: "Fog of War" });
  await expect(settings.getByRole("radio", { name: "Off" })).toBeChecked();
  await settings.getByRole("radio", { name: "Explore" }).click();
  await expect(settings.getByRole("radio", { name: "Explore" })).toBeChecked();
  await expect(settings.getByRole("button", { name: "Cover Explored Areas" })).toBeDisabled();

  const canvas = page.locator(".scene-canvas");
  const b = (await canvas.boundingBox())!;
  const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };

  // A square revealed to players, dragged corner to corner.
  await page.getByRole("button", { name: "Fog of War (O)" }).click();
  await page.getByRole("radio", { name: "Reveal" }).click();
  await page.getByRole("radio", { name: "Square" }).click();
  await settled(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 150, at.y + 120, { steps: 10 });
  await page.mouse.up();

  // The Select tool picks it once Fog of War is on, and it can be made to hide instead.
  await page.getByRole("button", { name: "Select (V)" }).click();
  await page.getByRole("button", { name: "Fog of War", exact: true }).click();
  await page.mouse.click(at.x + 70, at.y + 60);
  const bar = page.getByRole("toolbar", { name: "Selection" });
  await expect(bar.getByRole("radio", { name: "Reveal" })).toBeChecked();
  await bar.getByRole("radio", { name: "Hide" }).click();
  await expect(bar.getByRole("radio", { name: "Hide" })).toBeChecked();
});
