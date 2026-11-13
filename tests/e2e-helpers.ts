import { inTransition } from "../src/ui/transition";
import { expect, type Locator, type Page } from "./browser-test";

/** Opens the new campaign dialog from the lobby, empty or not. */
export async function openNewCampaign(page: Page) {
  await page.getByRole("button", { name: /^(Create a|New) Campaign$/ }).click();
}

export async function createCampaign(page: Page, name = "The Lost Barrows", systemId?: string) {
  await openNewCampaign(page);
  await page.getByPlaceholder("The Lost Barrows").fill(name);
  await page.getByPlaceholder("Robin").first().fill("Tester");
  if (systemId) await page.getByLabel("System").selectOption(systemId);
  await page.getByRole("button", { name: "Create Campaign" }).click();
  await expect(page.locator('[aria-label="Scene: The Opening Scene"]')).toBeVisible();
  // The table zooms in from the lobby; it takes clicks once that's over.
  await settled(page);
}

export async function drag(page: Page, from: Locator, x: number, y: number) {
  const bounds = await from.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("Cannot drag an element without a bounding box.");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

export async function openCharacters(page: Page) {
  const tab = page.getByRole("tab", { name: "Characters" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  const create = page.getByRole("button", { name: "New", exact: true });
  await expect(create).toBeInViewport();
  await create.click();
}

/** Open one of the shown character's moves in its window, from the sheet's Moves list. */
export async function openSheetMove(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Move type" }).selectOption("all");
  await page.getByRole("region", { name: "Moves" }).getByText(name, { exact: true }).click();
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

export async function chooseCreationOptions(page: Page, form: Locator) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pickers = form.locator(".creation-choice .option-picker-trigger");
    let selected = false;
    for (let index = 0; index < (await pickers.count()); index++) {
      const picker = pickers.nth(index);
      const label = (await picker.getAttribute("aria-label")) ?? "";
      if (!label.endsWith(": Choose…")) continue;
      const name = label.slice(0, label.indexOf(":"));
      await picker.click();
      await page.getByRole("dialog", { name }).getByRole("option").nth(1).click();
      selected = true;
      break;
    }
    if (!selected) break;
  }
  const relationshipPc = form.getByRole("combobox", { name: "PC" });
  if (await relationshipPc.count()) {
    await relationshipPc.selectOption({ index: 1 });
    await expect(relationshipPc).not.toHaveValue("");
    await expect(form.getByRole("button", { name: "Create", exact: true })).toBeEnabled();
  }
  const remainingChoices = form.locator(
    '.creation-choice .option-picker-trigger[aria-label$=": Choose…"]',
  );
  if (await remainingChoices.count())
    throw new Error("Some required class creation choices remain unselected.");
}

export async function addRelationshipAtDepthThree(page: Page, name: string) {
  const relationship = page.getByRole("combobox", { name: "Add a relationship" });
  await relationship.fill(name);
  await page
    .locator(".note-suggest")
    .getByRole("option", { name: new RegExp(name) })
    .click();
  await page.getByRole("spinbutton", { name: `Depth with ${name}` }).fill("3");
}

/**
 * Wait for view transitions and other animations to finish. A transition
 * counts from when it starts, before its update has run and anything animates.
 */
export async function settled(page: Page) {
  await page.waitForFunction(
    () => !inTransition() && document.documentElement.getAnimations({ subtree: true }).length === 0,
  );
}
