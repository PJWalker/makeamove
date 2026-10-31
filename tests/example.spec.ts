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

test("a GM can create an NPC", async ({ page }) => {
  await createCampaign(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "NPC" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Mira Ashford");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Mira Ashford",
  );
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

  await page.getByRole("textbox", { name: "Name" }).fill("Vex");
  await page.getByLabel("Class").selectOption("wizard");
  await page.getByLabel("Species").selectOption("goliath");
  await page
    .getByRole("combobox", { name: "Background" })
    .selectOption("soldier");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Vex");
  await expect(page.getByText("Wizard 1", { exact: true })).toBeVisible();
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

  await notes.click();
  await chat.click();
  await notes.click();
  await chat.click();
  await notes.click();

  await expect(notes).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No pages yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New page" })).toBeVisible();
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
