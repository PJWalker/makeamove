import { expect, test } from "./browser-test";
import { createCampaign } from "./e2e-helpers";

test("notes can be written, reopened, and deleted", async ({ page }) => {
  await createCampaign(page, "Notes flow");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "New page" }).click();

  await page.getByRole("textbox", { name: "Title" }).fill("Council of Ravens");
  const body = page.getByRole("textbox", { name: "Note text" });
  await body.fill("The council meets beneath the old bell tower.");
  await expect(body).toContainText("The council meets beneath the old bell tower.");
  await page.getByRole("button", { name: "Back to the notes" }).click();
  await page.getByText("Council of Ravens", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toContainText(
    "The council meets beneath the old bell tower.",
  );

  await page.getByRole("button", { name: "Back to the notes" }).click();
  await page.getByText("Council of Ravens", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete page…" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete page" });
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Council of Ravens", { exact: true })).toHaveCount(0);
});

test("Notes search opens a page at the matching text", async ({ page }) => {
  await createCampaign(page, "Notes search");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Council of Ravens");
  const body = page.getByRole("textbox", { name: "Note text" });
  await body.fill("The council meets beneath the old bell tower.");
  await page.getByRole("button", { name: "Back to the notes" }).click();
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Unrelated page");
  await page.getByRole("textbox", { name: "Note text" }).fill("A different page of notes.");
  await page.getByRole("button", { name: "Back to the notes" }).click();

  await page.getByRole("searchbox", { name: "Search Notes" }).fill("beneath the old bell tower");
  await page.getByRole("button", { name: /Council of Ravens/ }).click();
  await expect(body).toContainText("The council meets beneath the old bell tower.");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe("beneath the old bell tower");
});
