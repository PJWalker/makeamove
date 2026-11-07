import { expect, test } from "./browser-test";
import { createCampaign, openCharacters } from "./e2e-helpers";

test("a GM can create an NPC", async ({ page }) => {
  await createCampaign(page);
  await openCharacters(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "NPC" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Mira Ashford");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Mira Ashford");
  await expect(page.getByRole("textbox", { name: "Description" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "GM Notes" })).toBeVisible();
});

test("a GM can create a PC with common description and GM notes", async ({ page }) => {
  await createCampaign(page, "Character notes test");
  await openCharacters(page);
  await page.locator('.sheet-new input:not([type="radio"]):not([type="checkbox"])').first().fill("Ayla");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Description" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "GM Notes" })).toBeVisible();
});

test("the system-less default starts a usable campaign", async ({ page }) => {
  await page.locator('input[placeholder="The Lost Barrows"]').fill("Freeform Table");
  await page.locator('input[placeholder="Robin"]').first().fill("Tester");
  await expect(page.getByLabel("System")).toHaveValue("none");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible();

  await openCharacters(page);
  await page
    .locator('.sheet-new input:not([type="radio"]):not([type="checkbox"])')
    .first()
    .fill("Freeform Hero");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Freeform Hero");
});

test("guided character creation saves the chosen class and origins", async ({ page }) => {
  await createCampaign(page, "Origins", "dnd-5.5e");
  await openCharacters(page);

  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Vex");
  for (const [label, option] of [
    ["Class", "Wizard"],
    ["Species", "Goliath"],
    ["Background", "Soldier"],
  ]) {
    await creation.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
    await page.getByRole("dialog", { name: label }).getByRole("option", { name: option }).click();
  }
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.locator(".sheet-name")).toHaveValue("Vex");
  await expect(page.getByText("Wizard 1", { exact: true })).toBeVisible();
});
