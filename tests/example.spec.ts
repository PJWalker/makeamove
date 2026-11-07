import { expect, test, type Locator, type Page } from "@playwright/test";

async function createCampaign(
  page: Page,
  name = "The Lost Barrows",
  systemId?: string,
) {
  await page.goto("/");
  await page.getByPlaceholder("The Lost Barrows").fill(name);
  await page.getByPlaceholder("Robin").first().fill("Tester");
  if (systemId) await page.getByLabel("System").selectOption(systemId);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(
    page.locator('[aria-label="Scene: The Opening Scene"]'),
  ).toBeVisible();
}

async function drag(page: Page, from: Locator, x: number, y: number) {
  const bounds = await from.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

async function openCharacters(page: Page) {
  const tab = page.getByRole("tab", { name: "Characters" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  const create = page.getByRole("button", { name: "New", exact: true });
  await expect(create).toBeInViewport();
  await create.click();
}

/** Open one of the shown character's moves in its window, from the sheet's Moves list. */
async function openSheetMove(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Move type" }).selectOption("all");
  await page.getByRole("region", { name: "Moves" }).getByText(name, { exact: true }).click();
  await expect(page.getByRole("dialog", { name })).toBeVisible();
}

async function chooseCreationOptions(page: Page, form: Locator) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const pickers = form.locator(".creation-choice .option-picker-trigger");
    let selected = false;
    for (let index = 0; index < await pickers.count(); index++) {
      const picker = pickers.nth(index);
      const label = await picker.getAttribute("aria-label") ?? "";
      if (!label.endsWith(": Choose…")) continue;
      const name = label.slice(0, label.indexOf(":"));
      await picker.click();
      await page.getByRole("dialog", { name })
        .getByRole("option").nth(1).click();
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

async function addRelationshipAtDepthThree(page: Page, name: string) {
  const relationship = page.getByRole("combobox", { name: "Add a relationship" });
  await relationship.fill(name);
  await page.locator(".note-suggest")
    .getByRole("option", { name: new RegExp(name) }).click();
  await page.getByRole("spinbutton", { name: `Depth with ${name}` }).fill("3");
}

/** Wait for view transitions and other animations to finish. */
async function settled(page: Page) {
  await page.waitForFunction(
    () => document.documentElement.getAnimations({ subtree: true }).length === 0,
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("a campaign can be created, left, and reopened", async ({ page }) => {
  await createCampaign(page);
  await expect(
    page.locator('[aria-label="Scene: The Opening Scene"]'),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Scene: The Opening Scene"]'),
  ).toHaveAttribute("aria-label", "Scene: The Opening Scene");

  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();
  const campaign = page.getByRole("button", { name: /^The Lost Barrows/ });
  await expect(campaign).toBeVisible();
  await expect(campaign).toContainText("No system");
  await campaign.click();
  await expect(
    page.locator('[aria-label="Scene: The Opening Scene"]'),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator('[aria-label="Scene: The Opening Scene"]'),
  ).toBeVisible();
});

test("selected menu items fade after the menu closes", async ({ page }) => {
  await createCampaign(page, "Menu selection transition");
  await settled(page);

  for (const interaction of ["pointer", "keyboard", "reduced-motion"] as const) {
    await page.emulateMedia({
      reducedMotion: interaction === "reduced-motion" ? "reduce" : "no-preference",
    });
    await page.getByRole("button", { name: "Campaign menu" }).click();
    const item = page.getByRole("menuitemcheckbox").first();
    if (interaction === "keyboard") await item.focus();
    await page.evaluate(() => {
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = ((update: () => void) => {
        const transition = start(update);
        void transition.ready.then(() => {
          for (const animation of document.getAnimations()) {
            if (animation.animationName === "vt-exit") animation.pause();
          }
        });
        return transition;
      }) as typeof document.startViewTransition;
    });
    if (interaction === "keyboard") await item.press("Enter");
    else await item.click();

    await expect(page.getByRole("menu")).toHaveCount(0);
    const outgoing = () => page.evaluate(() =>
      document.getAnimations().filter((animation) =>
        animation instanceof CSSAnimation &&
        animation.animationName === "vt-exit" &&
        (animation.effect as KeyframeEffect).pseudoElement?.startsWith(
          "::view-transition-old(menu-selection-",
        ),
      ).length,
    );
    if (interaction === "reduced-motion") expect(await outgoing()).toBe(0);
    else {
      await expect.poll(outgoing).toBe(1);
      await page.evaluate(() => {
        for (const animation of document.getAnimations()) animation.finish();
      });
      await settled(page);
    }
  }
});

test("right-drag menus select and close on release", async ({ page }) => {
  await createCampaign(page, "Right-drag menu");
  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();
  const campaign = page.getByRole("button", { name: /^Right-drag menu/ });
  await expect(campaign).toBeVisible();
  await settled(page);
  await campaign.hover();
  await page.mouse.down({ button: "right" });
  const item = page.getByRole("menuitem", { name: "Delete…" });
  await expect(item).toBeVisible();
  await item.hover();
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Delete campaign?" })).toBeVisible();
});

test("campaign deletion is available from the right-click menu and confirms", async ({
  page,
}) => {
  await createCampaign(page, "Delete menu test");
  await page.getByRole("button", { name: "Campaign menu" }).click();
  await page.getByRole("menuitem", { name: "Back to campaigns" }).click();

  const campaign = page.getByRole("button", { name: /^Delete menu test/ });
  await expect(campaign).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete Delete menu test" }),
  ).toHaveCount(0);
  await campaign.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…" }).click();

  const confirmation = page.getByRole("dialog", { name: "Delete campaign?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toBeHidden();

  await campaign.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page
    .getByRole("dialog", { name: "Delete campaign?" })
    .getByRole("button", { name: "Delete from this device" })
    .click();
  await expect(campaign).toHaveCount(0);
});

test("opening an invite link presents a join modal, not a lobby section", async ({
  page,
}) => {
  await page.goto("/#join=abc.1234567890abcdef");

  const invitation = page.getByRole("dialog", { name: "Join a campaign" });
  await expect(invitation).toBeVisible();
  await expect(invitation.getByLabel("Your name")).toBeFocused();
  await expect(page.locator(".lobby-join")).toHaveCount(0);
});

test("a GM can create an NPC", async ({ page }) => {
  await createCampaign(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "NPC" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Mira Ashford");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Mira Ashford",
  );
  await expect(
    page.getByRole("textbox", { name: "Description" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "GM Notes" })).toBeVisible();
});

test("a GM can create a PC with common description and GM notes", async ({
  page,
}) => {
  await createCampaign(page, "Character notes test");
  await openCharacters(page);
  await page.getByRole("textbox", { name: "Name" }).fill("Ayla");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(
    page.getByRole("textbox", { name: "Description" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "GM Notes" })).toBeVisible();
});

test("a player can send a chat message", async ({ page }) => {
  await createCampaign(page);
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("The guards retreat.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("The guards retreat.", { exact: true }),
  ).toBeVisible();
  await expect(message).toBeEmpty();
});

test("a GM can add and rename a scene, and toggle its sidebar", async ({
  page,
}) => {
  await createCampaign(page);
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true")
    await scenesTab.click();

  const sceneName = page.getByRole("textbox", { name: "Scene name" });
  await expect(sceneName).toHaveValue("The Opening Scene");
  await scenesTab.click();
  await expect(sceneName).not.toBeInViewport();
  await scenesTab.click();
  await expect(sceneName).toBeInViewport();

  await page.getByRole("button", { name: "Back to the scene list" }).click();
  const sceneRows = page.locator(".scene-item");
  await expect(sceneRows).toHaveCount(1);
  await page.getByRole("button", { name: "New scene" }).click();
  await expect(sceneRows).toHaveCount(2);
  await sceneName.fill("The Ashen Keep");
  await expect(sceneName).toHaveValue("The Ashen Keep");
  await page.reload();
  await expect(
    page.locator('[aria-label="Scene: The Ashen Keep"]'),
  ).toBeVisible();
});

test("scenes can be filed and pulled or deleted from their context menu", async ({
  page,
}) => {
  await createCampaign(page, "Scene folders test");
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true")
    await scenesTab.click();

  await expect(
    page.getByRole("button", { name: "Pull players here" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to the scene list" }).click();
  await page.getByRole("button", { name: "New scene" }).click();
  await page.getByRole("button", { name: "Back to the scene list" }).click();

  await page.getByRole("button", { name: "New folder" }).click();
  const folderName = page.getByRole("textbox", { name: "Folder name" });
  await folderName.fill("Journeys");
  await folderName.press("Enter");
  const folder = page.locator(".list-group").filter({ hasText: "Journeys" });
  await expect(folder).toBeVisible();

  const openingScene = page.getByRole("button", { name: "The Opening Scene" });
  await openingScene.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Journeys" }).click();
  await expect(folder.locator(".scene-item")).toHaveCount(1);

  const secondScene = page.getByRole("button", { name: "Scene 2" });
  await secondScene.click({ button: "right" });
  const sceneMenu = page.getByRole("menu");
  await expect(
    sceneMenu.getByRole("menuitem", { name: "Pull players here" }),
  ).toBeVisible();
  const pullItem = sceneMenu.getByRole("menuitem", {
    name: "Pull players here",
  });
  const sceneChangeNotice = page.getByText("Scene changed to Scene 2", {
    exact: true,
  });
  await expect(sceneChangeNotice).toHaveCount(1);
  const noticesBeforePull = await sceneChangeNotice.count();
  await pullItem.evaluate((element) => {
    const click = () =>
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    click();
    click();
  });
  await expect(secondScene).toHaveAttribute("aria-current", "true");
  await expect(sceneChangeNotice).toHaveCount(noticesBeforePull + 1);
  await secondScene.click({ button: "right" });
  await expect(
    sceneMenu.getByRole("menuitem", { name: "Delete scene" }),
  ).toBeVisible();
  await expect(sceneMenu).toHaveAttribute("data-closing", "false");
  await sceneMenu.getByRole("menuitem", { name: "Delete scene" }).click();
  await expect(page.locator(".scene-item")).toHaveCount(1);
});

test("filterable graphics float above windows and support keyboard dismissal", async ({
  page,
}) => {
  await createCampaign(page, "Graphic picker test");
  const scenesTab = page.getByRole("tab", { name: "Scenes" });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true")
    await scenesTab.click();

  const trigger = page.getByRole("button", { name: "Search icons…" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menu = page.getByRole("dialog", { name: "Built-in icons" });
  await expect(menu).toBeVisible();

  const search = menu.getByRole("searchbox", { name: "Search built-in icons" });
  await search.fill("bow");
  const options = menu.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAccessibleName("bow");
  await expect(options.nth(1)).toHaveAccessibleName("crossbow");
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(0)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(menu).toHaveCount(0);
});

test("the system-less default starts a usable campaign", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("The Lost Barrows").fill("Freeform Table");
  await page.getByPlaceholder("Robin").first().fill("Tester");
  await expect(page.getByLabel("System")).toHaveValue("none");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(
    page.locator('[aria-label="Scene: The Opening Scene"]'),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible();

  await openCharacters(page);
  await page.getByRole("textbox", { name: "Name" }).fill("Freeform Hero");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Freeform Hero",
  );
});

test("guided character creation saves the chosen class and origins", async ({
  page,
}) => {
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

test("DW2 PCs forge and advance one shared Bond at mutual Depth three", async ({
  page,
}) => {
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
      await expect(creation.getByText("Another PC already plays this Class", { exact: false })).toBeVisible();
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
  await expect(relationships.getByRole("textbox", { name: "How Brom sees Ayla" })).toHaveValue("Ayla rescued me");
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

  await expect(page.getByRole("region", { name: "Treasure & Wealth" }).getByRole("group", { name: "Treasure" }).locator("output")).toContainText("3/40");
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
  await page.getByRole("searchbox", { name: "Search the Libraries" }).fill("Alveric’s Soulstealer Blade");
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
  await page.getByRole("dialog", { name: "Class" }).getByRole("option", { name: "The Bard" }).click();

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
  await expect(page.getByRole("region", { name: "Stats & conditions" }).getByRole("button", { name: "Roll +Charisma" })).toContainText("+2");
  const identity = page.getByRole("region", { name: "Origins and appearance" });
  await expect(identity.getByRole("textbox", { name: "Pronouns" })).toHaveValue("she/her");
  await expect(identity.getByRole("textbox", { name: "Ancestry" })).toHaveValue("Elf");
  await expect(page.getByRole("region", { name: "Inventory" })).toContainText("A noble's crossbow");
});

test("DW2 Class Change reassigns advancements and preserves campaign progress", async ({ page }) => {
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
  await page.getByRole("dialog", { name: "Advancement 2" })
    .getByRole("option", { name: /Increase a Stat\s*\+1 Dexterity/ }).click();
  await firstAdvancement.getByRole("button", { name: "Level up", exact: true }).click();

  for (let mark = 1; mark <= 5; mark++) await increaseXp.click();
  await page.getByRole("button", { name: "Change Class", exact: true }).click();
  const change = page.getByRole("dialog", { name: "Erinyette: change Class" });
  await change.getByRole("button", { name: /^New Class:/ }).click();
  await page.getByRole("dialog", { name: "New Class" }).getByRole("option", { name: "The Bard" }).click();
  await change.getByRole("button", { name: /^Advancement 2:/ }).click();
  await page.getByRole("dialog", { name: "Advancement 2" })
    .getByRole("option", { name: /Increase a Stat\s*\+1 Dexterity/ }).click();
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
  await session.getByLabel("Did we learn something new and important about the world or NPCs?").check();
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
  await page.getByRole("region", { name: "Relationships" }).getByRole("button", { name: "Ayla" }).click();
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
  await prompt.getByRole("radiogroup", { name: "Stat to roll" }).getByRole("button", { name: "STR" }).click();
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
  await expect(page.getByRole("group", { name: "Treasure" }).locator("output")).toContainText("2/40");
  await expect(page.getByRole("log")).toContainText("spends 1 Treasure on Repair of");
  await downtime.getByRole("button", { name: "Begin Downtime" }).click();
  await expect(downtime.getByRole("button", { name: "Train (1 Treasure for 1 XP)" })).toBeEnabled();
});

test("DW2 advancement reveals a source-backed Struggle with its track", async ({
  page,
}) => {
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
  await page.getByRole("dialog", { name: "Advancement 2" })
    .getByRole("option", { name: /Reveal a Struggle\s*Reformed/ }).click();
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

test("using a move asks for its stat and posts the result to chat", async ({
  page,
}) => {
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

  await expect(
    page.getByRole("log").getByText(/Defy Danger.*Ayla/),
  ).toBeVisible();
});

test("notes can be written, reopened, and deleted", async ({ page }) => {
  await createCampaign(page, "Notes flow");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "New page" }).click();

  await page.getByRole("textbox", { name: "Title" }).fill("Council of Ravens");
  const body = page.getByRole("textbox", { name: "Note text" });
  await body.fill("The council meets beneath the old bell tower.");
  await expect(body).toContainText(
    "The council meets beneath the old bell tower.",
  );
  await page.getByRole("button", { name: "Back to the notes" }).click();
  await page.getByText("Council of Ravens", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toContainText(
    "The council meets beneath the old bell tower.",
  );

  await page.getByRole("button", { name: "Back to the notes" }).click();
  await page
    .getByText("Council of Ravens", { exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete page…" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete page" });
  await confirmation
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByText("Council of Ravens", { exact: true }),
  ).toHaveCount(0);
});

test("rapid panel changes settle on the last selected panel", async ({
  page,
}) => {
  await createCampaign(page, "Panel transitions");
  const notes = page.getByRole("tab", { name: "Notes" });
  const chat = page.getByRole("tab", { name: /^Chat/ });

  await settled(page);
  await page.addStyleTag({
    content: `
      ::view-transition-group(*),
      ::view-transition-old(*),
      ::view-transition-new(*) {
        animation-duration: 5s !important;
      }
    `,
  });
  await notes.click();
  await page.waitForFunction(() =>
    document.getAnimations().some((animation) =>
      animation.effect instanceof KeyframeEffect &&
      animation.effect.pseudoElement?.startsWith("::view-transition"),
    ),
  );
  await chat.click({ timeout: 1000 });
  await notes.click({ timeout: 1000 });
  await chat.click({ timeout: 1000 });
  await notes.click({ timeout: 1000 });

  await expect(notes).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No pages yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible();
});

test("panel creation actions share the title bar when docked and floating", async ({ page }) => {
  await createCampaign(page, "Inline panel actions", "dnd-5.5e");
  for (const [title, actions] of [
    ["Characters", ["New", "New folder"]],
    ["Scenes", ["New scene", "New folder"]],
    ["Notes", ["New page", "New GM page", "New folder"]],
    ["Items", ["New gear", "New move"]],
    ["Combat", ["Roll for NPCs", "Start"]],
  ] as const) {
    const tab = page.getByRole("tab", { name: title, exact: true });
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    const header = page.locator(".sidebar-panel > .panel-header").filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    for (const action of actions) {
      await expect(header.getByRole("button", { name: action, exact: true })).toBeVisible();
    }
    if (actions.some((action) => action === "New folder")) {
      await header.getByRole("button", { name: "New folder", exact: true }).click();
      const folderName = header.getByRole("textbox", { name: "Folder name" });
      await expect(folderName).toBeFocused();
      await folderName.fill(`${title} folder`);
      await folderName.press("Enter");
      await expect(folderName).toHaveCount(0);
      await expect(header.getByRole("button", { name: "New folder", exact: true })).toBeVisible();
    }
  }

  const itemsTab = page.getByRole("tab", { name: "Items", exact: true });
  if ((await itemsTab.getAttribute("aria-selected")) !== "true") await itemsTab.click();
  await page.getByRole("button", { name: "New gear", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New gear", exact: true })).toBeVisible();
  await expect(page.locator(".panel-actions").getByRole("button", { name: "New gear" })).toHaveCount(0);
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page.getByRole("tab", { name: "Items", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a window" }).click();
  const itemsWindow = page.getByRole("region", { name: "Items", exact: true });
  const header = itemsWindow.locator(".panel-header");
  const title = header.getByRole("heading", { name: "Items", exact: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const action of ["New gear", "New move"]) {
      const button = header.getByRole("button", { name: action, exact: true });
      await expect(button).toBeVisible();
      const titleBox = (await title.boundingBox())!;
      const buttonBox = (await button.boundingBox())!;
      expect(buttonBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
      expect(buttonBox.y).toBeLessThan(titleBox.y + titleBox.height);
      expect(buttonBox.y + buttonBox.height).toBeGreaterThan(titleBox.y);
    }
  }
  await header.getByRole("button", { name: "New move", exact: true }).click();
  await expect(itemsWindow.getByRole("heading", { name: "New move", exact: true })).toBeVisible();
  await expect(itemsWindow).toHaveAttribute("data-rolled", "false");
});

test("a panel can be floated and docked on the other sidebar", async ({
  page,
}) => {
  await createCampaign(page, "Window movement");
  const notesTab = page.getByRole("tab", { name: "Notes" });
  await notesTab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a window" }).click();
  const notesWindow = page.getByRole("region", { name: "Notes" });
  await expect(notesWindow).toBeVisible();
  await expect(notesTab).toHaveCount(0);

  const title = notesWindow.getByRole("heading", { name: "Notes" });
  const leftSidebar = page.getByRole("complementary", { name: "Left sidebar" });
  const leftTab = page.getByRole("tab", { name: "Scenes" });
  const leftTabBounds = await leftTab.boundingBox();
  expect(leftTabBounds).not.toBeNull();
  await drag(
    page,
    title,
    leftTabBounds!.x + leftTabBounds!.width / 2,
    leftTabBounds!.y + leftTabBounds!.height / 2,
  );

  await expect(notesWindow).toHaveCount(0);
  await expect(leftSidebar.getByRole("tab", { name: "Notes" })).toBeVisible();
});

test("a floating panel can be rolled up and restored", async ({ page }) => {
  await createCampaign(page, "Window animation");
  await page.getByRole("tab", { name: "Notes" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Float in a window" }).click();

  const notesWindow = page.getByRole("region", { name: "Notes" });
  const title = notesWindow.getByRole("heading", { name: "Notes" });
  const newPage = notesWindow.getByRole("button", { name: "New page" });
  await expect(newPage).toBeVisible();
  await title.dblclick();
  await expect(newPage).toBeHidden();
  await title.dblclick();
  await expect(newPage).toBeVisible();
});

test("a sidebar resizes from its tab strip's edge by pointer and keyboard", async ({
  page,
}) => {
  await createCampaign(page, "Sidebar resizing");
  const sidebar = page.getByRole("complementary", { name: "Right sidebar" });
  const body = sidebar.getByRole("tabpanel");
  const handle = sidebar.getByRole("separator", { name: "Resize right sidebar" });
  const chatTab = sidebar.getByRole("tab", { name: /^Chat/ });
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(handle).toHaveAttribute("aria-valuenow", "340");
  const width = async () => (await body.boundingBox())!.width;
  expect(await width()).toBeCloseTo(340, 0);

  // Dragging the strip's outer edge widens the sidebar by the distance moved,
  // once the view transitions have settled (they take over hit-testing).
  await settled(page);
  const edge = (await handle.boundingBox())!;
  const x = edge.x + edge.width / 2;
  const y = edge.y + edge.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, { steps: 6 });
  await expect(page.locator("html")).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await expect(page.locator("html")).not.toHaveClass(/is-dragging/);
  await expect(handle).toHaveAttribute("aria-valuenow", "400");
  expect(await width()).toBeCloseTo(400, 0);

  // An interrupted drag ends cleanly.
  await page.mouse.move(x - 60, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).not.toHaveClass(/is-dragging/);
  await page.mouse.move(x - 200, y);
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "410");

  // The keyboard: arrows step, Shift steps further, Home shuts, Enter resets.
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "426");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "362");
  await page.keyboard.press("Home");
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await expect(handle).toHaveAttribute("aria-valuetext", "Collapsed");
  await page.keyboard.press("ArrowLeft");
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(handle).toHaveAttribute("aria-valuenow", "362");
  await page.keyboard.press("Enter");
  await expect(handle).toHaveAttribute("aria-valuenow", "340");

  // The width is kept across a reload.
  await page.keyboard.press("End");
  const max = await handle.getAttribute("aria-valuemax");
  await expect(handle).toHaveAttribute("aria-valuenow", max!);
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", max!);

  // The tabs still select and collapse the sidebar on click.
  await chatTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await chatTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(chatTab).toHaveAttribute("aria-selected", "true");

  // A shut sidebar can be dragged back open from the strip's edge.
  await chatTab.click();
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await settled(page);
  const shut = (await handle.boundingBox())!;
  const shutX = shut.x + shut.width / 2;
  const shutY = shut.y + shut.height / 2;
  await page.mouse.move(shutX, shutY);
  await page.mouse.down();
  await page.mouse.move(shutX - 300, shutY, { steps: 8 });
  await page.mouse.up();
  await expect(sidebar).toHaveAttribute("data-open", "true");
  await expect(handle).toHaveAttribute("aria-valuenow", "300");
});
