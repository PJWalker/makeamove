import { expect, test } from "./browser-test";
import { createCampaign, openCharacters } from "./e2e-helpers";

test("a player can send a chat message", async ({ page }) => {
  await createCampaign(page);
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("The guards retreat.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("The guards retreat.", { exact: true })).toBeVisible();
  await expect(message).toBeEmpty();
});

test("using a move asks for its stat and posts the result to chat", async ({ page }) => {
  await createCampaign(page, "Move flow", "dungeon-world");
  await openCharacters(page);
  await page.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await page.getByLabel("Class").selectOption("fighter");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await page.getByRole("radio", { name: "Basic" }).click();
  await page.getByRole("button", { name: "Roll: Defy Danger" }).click();
  const prompt = page.getByRole("dialog", { name: "Defy Danger (Ayla)" });
  await prompt
    .getByRole("radiogroup", { name: "Stat to roll" })
    .getByRole("button", { name: "STR" })
    .click();
  await prompt.getByRole("button", { name: /^Roll / }).click();

  await expect(page.getByRole("log").getByText(/Defy Danger.*Ayla/)).toBeVisible();
});
