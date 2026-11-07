import { expect, test } from "@playwright/test";
import { createCampaign, openCharacters, openSheetMove, chooseCreationOptions, addRelationshipAtDepthThree } from "./e2e-helpers";

test.use({ viewport: { width: 1280, height: 800 } });

test("DW2 PCs forge and advance one shared Bond at mutual Depth three", async ({ page }) => {
  await createCampaign(page, "Bond progression", "dungeon-world-2");
  for (const name of ["Ayla", "Brom"]) {
    await openCharacters(page);
    const creation = page.locator(".sheet-new");
    await expect(creation).toBeVisible();
    await creation.getByRole("textbox", { name: "Name" }).fill(name);
    await chooseCreationOptions(page, creation);
    await creation.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".sheet-name")).toHaveValue(name);
  }

  await page.getByRole("spinbutton", { name: "Depth with Ayla" }).fill("3");
  await page.locator(".relationship-name").filter({ hasText: "Ayla" }).click();
  await addRelationshipAtDepthThree(page, "Brom");

  await page.getByLabel("Bondmate").selectOption({ label: "Brom" });
  await page.getByLabel("Bond type").selectOption("champions");
  await page.getByRole("button", { name: "Forge Bond" }).click();
  await expect(page.getByText("Champions", { exact: true })).toBeVisible();
  await page.getByText("Bond rules", { exact: true }).click();
  await expect(page.getByText(/One Vision\./)).toBeVisible();
  await expect(page.getByText("One Vision: Starting move")).toBeVisible();

  await addRelationshipAtDepthThree(page, "Brom");
  await page.locator("button.relationship-name").filter({ hasText: "Brom" }).click();
  await addRelationshipAtDepthThree(page, "Ayla");
  await page.locator("button.relationship-name").filter({ hasText: "Ayla" }).click();

  await page.getByLabel("Bondmate").selectOption({ label: "Brom" });
  await page.getByLabel("Bond type").selectOption("champions");
  await page.getByLabel("Advanced move").selectOption({ label: "Return the Favor" });
  await page.getByRole("button", { name: "Reinforce Bond" }).click();
  await page.getByText("Bond rules", { exact: true }).click();
  await expect(page.getByText("Return the Favor: Unlocked")).toBeVisible();
});

test("DW2 character creation establishes a first Relationship", async ({ page }) => {
  await createCampaign(page, "First relationship", "dungeon-world-2");
  for (const name of ["Ayla", "Brom"]) {
    await openCharacters(page);
    const creation = page.locator(".sheet-new");
    await creation.getByRole("textbox", { name: "Name" }).fill(name);
    await chooseCreationOptions(page, creation);
    if (name === "Brom") {
      await expect(
        creation.getByText("Another PC already plays this Class", { exact: false }),
      ).toBeVisible();
      await creation.getByRole("textbox", { name: "Relationship" }).fill("Ayla rescued me");
      await creation.getByLabel("Shared history").selectOption("2");
      await creation.getByRole("combobox", { name: "PC" }).selectOption({ label: "Ayla" });
      await expect(creation.getByRole("button", { name: "Create", exact: true })).toBeEnabled();
    }
    await creation.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".sheet-name")).toHaveValue(name);
  }

  const relationships = page.getByRole("region", { name: "Relationships" });
  await expect(relationships.getByRole("button", { name: "Ayla" })).toBeVisible();
  await expect(relationships.getByRole("textbox", { name: "How Brom sees Ayla" })).toHaveValue(
    "Ayla rescued me",
  );
  await expect(relationships.getByRole("spinbutton", { name: "Depth with Ayla" })).toHaveValue("2");
});

test("DW2 Treasure boxes advance Wealth tiers", async ({ page }) => {
  await createCampaign(page, "Wealth track", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Slick");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const wealth = page.getByRole("region", { name: "Treasure & Wealth" });
  await expect(wealth).toContainText("Poor");
  const treasure = wealth.getByRole("group", { name: "Treasure" });
  await expect(treasure.locator("output")).toContainText("4/40");
  const gain = treasure.getByRole("button").nth(1);
  for (let box = 0; box < 6; box++) await gain.click();
  await expect(wealth).toContainText("Modest");
  await expect(treasure.locator("output")).toContainText("10/40");
});

test("DW2 Library purchases spend a Treasure box for equal-Wealth gear", async ({ page }) => {
  await createCampaign(page, "Gear purchase", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Slick");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const libraries = page.getByRole("tab", { name: "Libraries" });
  if ((await libraries.getAttribute("aria-selected")) !== "true") await libraries.click();
  const search = page.getByRole("searchbox", { name: "Search the Libraries" });
  await search.fill("Shortspear");
  await page.getByText("Shortspear", { exact: true }).click();
  await page.getByRole("button", { name: "Purchase", exact: true }).click();

  await expect(
    page
      .getByRole("region", { name: "Treasure & Wealth" })
      .getByRole("group", { name: "Treasure" })
      .locator("output"),
  ).toContainText("3/40");
  await expect(page.getByRole("region", { name: "Inventory" })).toContainText("Shortspear");
});

test("DW2 magic items are available to GMs as grants, not purchases", async ({ page }) => {
  await createCampaign(page, "Magic item reference", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  await page.getByRole("button", { name: "Find items in the Libraries…" }).click();
  await page.getByRole("searchbox", { name: "Search the Libraries" }).fill("animated shield");
  await page.getByText("animated shield", { exact: true }).click();
  await page.getByRole("button", { name: "GM grant" }).click();
  await expect(page.getByRole("region", { name: "Inventory" })).toContainText("animated shield");
});

test("DW2 GM Reference searches source NPC guidance", async ({ page }) => {
  await createCampaign(page, "GM Reference", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("region", { name: "GM Reference" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Reference" }).click();
  await page.getByRole("searchbox", { name: "Search the Reference" }).fill("Drive");
  const npcs = page.locator(".reference-section", { hasText: "Major NPCs" });
  await expect(npcs).toContainText("A Non-Player Character (NPC)");
});

test("DW2 Artifact tracks unlock and expose a wielded move", async ({ page }) => {
  await createCampaign(page, "Artifact progression", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  await page.getByRole("button", { name: "Find items in the Libraries…" }).click();
  await page
    .getByRole("searchbox", { name: "Search the Libraries" })
    .fill("Alveric’s Soulstealer Blade");
  await page.getByText("Alveric’s Soulstealer Blade", { exact: true }).click();
  await page.getByRole("button", { name: "GM grant" }).click();

  const inventory = page.getByRole("region", { name: "Inventory" });
  const soulstealer = inventory.getByRole("button", { name: "Alveric’s Soulstealer Blade" });
  await soulstealer.click();
  const tracker = page.getByRole("region", { name: "Alveric’s Soulstealer Blade Artifact track" });
  const mark = tracker.getByRole("button", { name: "Mark Trapped Souls" });
  for (let box = 0; box < 4; box++) await mark.click();
  await tracker.getByLabel("Gravity-Defying Menace").check();
  await mark.click();
  await expect(tracker.getByLabel("Trapped Souls progress")).toHaveAttribute("value", "0");
  await expect(tracker).toContainText("Gravity-Defying Menace (unlocked)");
});

test("DW2 potion of healing applies its chosen effect and consumes a use", async ({ page }) => {
  await createCampaign(page, "Healing potion", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();
  const hp = page.getByRole("group", { name: "HP" });
  const decreaseHp = hp.locator(".counter-btn").first();
  await decreaseHp.click();
  await expect(hp.locator("output")).toContainText("11/12");
  await decreaseHp.click();
  await expect(hp.locator("output")).toContainText("10/12");

  await page.getByRole("button", { name: "Find items in the Libraries…" }).click();
  await page.getByRole("searchbox", { name: "Search the Libraries" }).fill("potion of healing");
  await page.getByText("Potion of healing", { exact: true }).click();
  await page.getByRole("button", { name: "GM grant" }).click();
  const inventory = page.getByRole("region", { name: "Inventory" });
  await inventory.getByRole("button", { name: "Potion of healing" }).click();
  // The newest window: the potion as carried, not its Libraries entry.
  const potion = page.getByRole("dialog", { name: "Potion of healing" }).last();
  await potion.getByLabel("Effect").selectOption("heal");
  await potion.getByRole("button", { name: "Use", exact: true }).click();
  await expect(hp.locator("output")).toContainText("11/12");
  await expect(inventory).toContainText("0/1 uses");
});

test("DW2 creation follows the selected class stat prompt", async ({ page }) => {
  await createCampaign(page, "Class stat prompts", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Vex");
  await creation.getByRole("textbox", { name: "Pronouns" }).fill("she/her");
  await creation.getByRole("textbox", { name: "Ancestry" }).fill("Elf");
  await creation.getByRole("button", { name: "Class: The Barbarian" }).click();
  await page
    .getByRole("dialog", { name: "Class" })
    .getByRole("option", { name: "The Bard" })
    .click();

  await creation.getByText("Class creation prompts", { exact: true }).click();
  await expect(creation.getByText(/What makes your art different/)).toBeVisible();
  await expect(creation.getByText(/artistic samples/)).toBeVisible();

  const assignments = creation.getByRole("button", { name: /Class-guided assignment/ });
  await expect(assignments).toBeVisible();
  await expect(creation.locator(".creation-score-grid .creation-score").nth(4)).toContainText("2");
  await assignments.click();
  const options = page.getByRole("dialog", { name: "Class-guided assignment" }).getByRole("option");
  await expect(options).toHaveCount(11);
  await options.nth(2).click();
  await expect(creation.locator(".creation-score-grid .creation-score").nth(4)).toContainText("2");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Stats & conditions" })
      .getByRole("button", { name: "Roll +Charisma" }),
  ).toContainText("+2");
  const identity = page.getByRole("region", { name: "Origins and appearance" });
  await expect(identity.getByRole("textbox", { name: "Pronouns" })).toHaveValue("she/her");
  await expect(identity.getByRole("textbox", { name: "Ancestry" })).toHaveValue("Elf");
  await expect(page.getByRole("region", { name: "Inventory" })).toContainText("A noble's crossbow");
});

test("DW2 Class Change reassigns advancements and preserves campaign progress", async ({
  page,
}) => {
  await createCampaign(page, "Class change", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Erinyette");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const xp = page.getByRole("group", { name: "XP" });
  const increaseXp = xp.getByRole("button").nth(1);
  for (let mark = 1; mark <= 5; mark++) {
    await increaseXp.click();
    await expect(xp.locator("output")).toContainText(String(mark));
  }
  await page.getByRole("button", { name: "Level up", exact: true }).click();
  const firstAdvancement = page.getByRole("dialog", { name: "Erinyette: advancement 2" });
  await firstAdvancement.getByRole("button", { name: /^Advancement 2:/ }).click();
  await page
    .getByRole("dialog", { name: "Advancement 2" })
    .getByRole("option", { name: /Increase a Stat\s*\+1 Dexterity/ })
    .click();
  await firstAdvancement.getByRole("button", { name: "Level up", exact: true }).click();

  for (let mark = 1; mark <= 5; mark++) await increaseXp.click();
  await page.getByRole("button", { name: "Change Class", exact: true }).click();
  const change = page.getByRole("dialog", { name: "Erinyette: change Class" });
  await change.getByRole("button", { name: /^New Class:/ }).click();
  await page
    .getByRole("dialog", { name: "New Class" })
    .getByRole("option", { name: "The Bard" })
    .click();
  await change.getByRole("button", { name: /^Advancement 2:/ }).click();
  await page
    .getByRole("dialog", { name: "Advancement 2" })
    .getByRole("option", { name: /Increase a Stat\s*\+1 Dexterity/ })
    .click();
  await change.getByRole("button", { name: "Change Class", exact: true }).click();

  await expect(page.locator(".sheet-name")).toHaveValue("Erinyette");
  await expect(page.getByRole("button", { name: "Class: The Bard" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Level" }).locator("output")).toHaveText("2");
  await expect(xp.locator("output")).toContainText("5/5");
  await expect(page.getByRole("group", { name: "HP" }).locator("output")).toContainText("9/9");
  await expect(page.getByRole("region", { name: "Treasure & Wealth" })).toContainText("Poor");
});

test("DW2 Comfort or Support disables after use for that PC this session", async ({ page }) => {
  await createCampaign(page, "Session-limited move", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const move = page.getByRole("button", { name: "Comfort or Support", exact: true });
  await expect(move).toHaveAttribute("aria-disabled", "false");
  await move.click();
  await expect(move).toHaveAttribute("aria-disabled", "true");
});

test("DW2 End the Session awards group XP from affirmative answers", async ({ page }) => {
  await createCampaign(page, "End the Session", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  await openSheetMove(page, "End the Session");
  const session = page.getByRole("region", { name: "End the Session" });
  await session.getByLabel("Did anyone add Depth to their Relationship(s)?").check();
  await session
    .getByLabel("Did we learn something new and important about the world or NPCs?")
    .check();
  await session.getByRole("button", { name: "Award group XP" }).click();
  await expect(page.getByRole("group", { name: "XP" }).locator("output")).toContainText("2/5");
  await expect(session.getByRole("button", { name: "Session ended" })).toBeDisabled();
});

test("DW2 Make Camp restores HP and is limited to once per session", async ({ page }) => {
  await createCampaign(page, "Make Camp", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const hp = page.getByRole("group", { name: "HP" });
  await hp.getByRole("button", { name: "Decrease HP" }).click();
  await expect(hp.locator("output")).toContainText("11/12");
  await openSheetMove(page, "Make Camp");
  const camp = page.getByRole("region", { name: "Make Camp" });
  await camp.getByRole("button", { name: "Finish Making Camp" }).click();
  await expect(hp.locator("output")).toContainText("12/12");
  await expect(camp.getByRole("button", { name: "Camp completed" })).toBeDisabled();
});

test("DW2 Comfort or Support applies the comforted PC's Depth choice", async ({ page }) => {
  await createCampaign(page, "Comfort or Support", "dungeon-world-2");
  for (const name of ["Ayla", "Brom"]) {
    await openCharacters(page);
    const creation = page.locator(".sheet-new");
    await creation.getByRole("textbox", { name: "Name" }).fill(name);
    await chooseCreationOptions(page, creation);
    await creation.getByRole("button", { name: "Create", exact: true }).click();
  }

  await openSheetMove(page, "Comfort or Support");
  const comfort = page.getByRole("region", { name: "Comfort or Support" });
  await comfort.getByLabel("Comforted PC").selectOption({ label: "Ayla" });
  await comfort.getByLabel("Did you explore, change, or reaffirm a Relationship or Bond?").check();
  await comfort.getByLabel("Benefit").selectOption("gain-depth");
  await comfort.getByRole("button", { name: "Resolve Comfort or Support" }).click();
  await expect(comfort.getByRole("button", { name: "Used this session" })).toBeDisabled();
  await page
    .getByRole("region", { name: "Relationships" })
    .getByRole("button", { name: "Ayla" })
    .click();
  await expect(page.getByRole("spinbutton", { name: "Depth with Brom" })).toHaveValue("1");
});

test("DW2 Perilous Journey prepares quick pace and its roll modifier", async ({ page }) => {
  await createCampaign(page, "Perilous Journey", "dungeon-world-2");
  for (const name of ["Ayla", "Brom"]) {
    await openCharacters(page);
    const creation = page.locator(".sheet-new");
    await creation.getByRole("textbox", { name: "Name" }).fill(name);
    await chooseCreationOptions(page, creation);
    await creation.getByRole("button", { name: "Create", exact: true }).click();
  }

  await openSheetMove(page, "Undertake a Perilous Journey");
  const journey = page.getByRole("region", { name: "Undertake a Perilous Journey" });
  await journey.getByLabel("Pace").selectOption("quick");
  await journey.getByRole("button", { name: "Prepare Journey" }).click();
  const prompt = page.getByRole("dialog", { name: "Undertake a Perilous Journey (Brom)" });
  await prompt
    .getByRole("radiogroup", { name: "Stat to roll" })
    .getByRole("button", { name: "STR" })
    .click();
  await expect(prompt.getByRole("button", { name: /^Roll .*?-1/ })).toBeVisible();
});

test("DW2 Downtime Train spends Treasure once per period", async ({ page }) => {
  await createCampaign(page, "Downtime", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  await openSheetMove(page, "Enjoy Downtime");
  const downtime = page.getByRole("region", { name: "Enjoy Downtime" });
  await downtime.getByRole("button", { name: "Begin Downtime" }).click();
  await downtime.getByRole("button", { name: "Train (1 Treasure for 1 XP)" }).click();
  await expect(page.getByRole("group", { name: "XP" }).locator("output")).toContainText("1/5");
  await expect(downtime.getByRole("button", { name: "Trained this Downtime" })).toBeDisabled();
  await downtime.getByLabel("Shop service").selectOption("repair");
  await downtime.getByLabel("Service tier").selectOption("3");
  await downtime.getByRole("button", { name: "Shop (1 Treasure)" }).click();
  await expect(page.getByRole("group", { name: "Treasure" }).locator("output")).toContainText(
    "2/40",
  );
  await expect(page.getByRole("log")).toContainText("spends 1 Treasure on Repair of");
  await downtime.getByRole("button", { name: "Begin Downtime" }).click();
  await expect(downtime.getByRole("button", { name: "Train (1 Treasure for 1 XP)" })).toBeEnabled();
});

test("DW2 advancement reveals a source-backed Struggle with its track", async ({ page }) => {
  await createCampaign(page, "Struggle progression", "dungeon-world-2");
  await openCharacters(page);
  const creation = page.locator(".sheet-new");
  await creation.getByRole("textbox", { name: "Name" }).fill("Vex");
  await chooseCreationOptions(page, creation);
  await creation.getByRole("button", { name: "Create", exact: true }).click();

  const xp = page.getByRole("group", { name: "XP" });
  const increaseXp = xp.getByRole("button").nth(1);
  for (let mark = 1; mark <= 5; mark++) {
    await increaseXp.click();
    await expect(xp.locator("output")).toContainText(String(mark));
  }
  await page.getByRole("button", { name: "Level up", exact: true }).click();

  const advancement = page.getByRole("dialog", { name: "Vex: advancement 2" });
  await advancement.getByRole("button", { name: /^Advancement 2:/ }).click();
  await page
    .getByRole("dialog", { name: "Advancement 2" })
    .getByRole("option", { name: /Reveal a Struggle\s*Reformed/ })
    .click();
  await advancement.getByRole("button", { name: "Level up", exact: true }).click();

  const struggle = page.getByRole("region", { name: "Current Struggle" });
  await expect(struggle.getByRole("heading", { name: "Reformed" })).toBeVisible();
  await expect(struggle.getByRole("spinbutton", { name: "Guilt" })).toHaveValue("2");
  await struggle.getByText("Struggle rules", { exact: true }).click();
  await expect(struggle.getByText(/Haunted \(\+\-\)/)).toBeVisible();
  await struggle.getByRole("button", { name: "Resolve Struggle" }).click();
  await expect(page.getByRole("group", { name: "Level" }).locator("output")).toHaveText("3");
  await expect(page.getByRole("group", { name: "XP" }).locator("output")).toContainText("0");
  await expect(page.getByRole("region", { name: "Current Struggle" })).toHaveCount(0);
});
